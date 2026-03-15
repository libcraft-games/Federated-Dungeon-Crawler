import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Box, Text, useApp, useStdout, useInput } from "ink";
import { WsClient } from "../connection/ws-client.js";
import { useGameState } from "../hooks/use-game-state.js";
import { StatusBar } from "./StatusBar.js";
import { RoomPanel } from "./RoomPanel.js";
import { CombatPanel, getCombatPanelHeight } from "./CombatPanel.js";
import { NarrativeView } from "./NarrativeView.js";
import { InputBar } from "./InputBar.js";
import { HintBar } from "./HintBar.js";
import { InfoPanel, INFO_PANEL_HEIGHT } from "./InfoPanel.js";
import { CharacterCreate } from "./CharacterCreate.js";
import { SplashScreen } from "./SplashScreen.js";
import { AccountSetup, type AccountResult } from "./AccountSetup.js";
import { ServerSelect } from "./ServerSelect.js";
import { saveProfile, loadProfile } from "../connection/saved-profile.js";

type AppPhase = "splash" | "account" | "server" | "create" | "play";

interface SystemData {
  classes: Record<string, { name: string; description: string; attributeBonuses?: Record<string, number>; spells?: string[]; tags?: string[] }>;
  races: Record<string, { name: string; description: string; attributeBonuses?: Record<string, number>; tags?: string[] }>;
}

interface ServerInfo {
  name: string;
  description: string;
  players: number;
  rooms: number;
}

export function App() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<AppPhase>("splash");

  // Account state
  const [account, setAccount] = useState<AccountResult | null>(null);

  // Server state
  const [serverUrl, setServerUrl] = useState("");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [system, setSystem] = useState<SystemData | null>(null);

  // Character state
  const [playerName, setPlayerName] = useState("");
  const [finalClass, setFinalClass] = useState("warrior");
  const [finalRace, setFinalRace] = useState("human");

  // Connection
  const [client, setClient] = useState<WsClient | null>(null);

  // ── Phase transitions ──

  const handleSplashDone = useCallback(() => {
    setPhase("account");
  }, []);

  const handleAccountDone = useCallback((result: AccountResult) => {
    setAccount(result);

    // If signup already resolved a server (create-account flow), skip ServerSelect
    if (result.serverUrl && result.serverInfo) {
      setServerUrl(result.serverUrl);
      setServerInfo(result.serverInfo);

      // Save profile with server info
      saveProfile({
        handle: result.handle,
        did: result.did ?? "",
        pdsUrl: result.pdsUrl ?? "",
        lastServer: result.serverUrl,
        lastServerName: result.serverInfo.name,
      });

      // Fetch system data for character creation
      fetch(`${result.serverUrl}/system`)
        .then((res) => res.json())
        .then((data) => {
          setSystem(data as SystemData);
          setPhase("create");
        })
        .catch(() => {
          setPhase("play");
        });
      return;
    }

    setPhase("server");
  }, []);

  const handleServerConnect = useCallback((url: string, info: ServerInfo) => {
    setServerUrl(url);
    setServerInfo(info);

    // Save last server to profile
    if (account) {
      saveProfile({
        handle: account.handle,
        did: account.did ?? "",
        pdsUrl: account.pdsUrl ?? "",
        lastServer: url,
        lastServerName: info.name,
      });
    }

    // Fetch system data for character creation
    fetch(`${url}/system`)
      .then((res) => res.json())
      .then((data) => {
        setSystem(data as SystemData);
        if (account?.mode === "dev") {
          setPlayerName(account.handle);
        }
        setPhase("create");
      })
      .catch(() => {
        // If system fetch fails, skip creation and go straight to play
        if (account?.mode === "dev") {
          setPlayerName(account.handle);
        }
        setPhase("play");
      });
  }, [account]);

  const handleCreateComplete = useCallback((chosenClass: string, chosenRace: string) => {
    setFinalClass(chosenClass);
    setFinalRace(chosenRace);
    setPhase("play");
  }, []);

  // ── Connect when entering play phase ──

  useEffect(() => {
    if (phase !== "play" || client) return;

    const c = new WsClient();

    if (account?.mode === "dev" && serverUrl) {
      // Dev mode: connect with query params
      const url = new URL(serverUrl);
      c.connect({
        host: url.hostname,
        port: parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10),
        tls: url.protocol === "https:",
        name: playerName || `Adventurer_${Math.floor(Math.random() * 9999)}`,
        classId: finalClass,
        raceId: finalRace,
      });
    }

    // OAuth mode: would use connectWithSession here after XRPC handshake
    // For now, dev mode is the only supported path

    setClient(c);
  }, [phase, client, account, serverUrl, playerName, finalClass, finalRace]);

  // ── Render phases ──

  if (phase === "splash") {
    return <SplashScreen onContinue={handleSplashDone} />;
  }

  if (phase === "account") {
    return <AccountSetup onComplete={handleAccountDone} />;
  }

  if (phase === "server") {
    const saved = loadProfile();
    return <ServerSelect savedProfile={saved} onConnect={handleServerConnect} />;
  }

  if (phase === "create" && system) {
    const classList = Object.entries(system.classes).map(([id, def]) => ({ id, ...def }));
    const raceList = Object.entries(system.races).map(([id, def]) => ({ id, ...def }));
    const name = playerName || account?.handle || "Adventurer";

    return (
      <CharacterCreate
        classes={classList}
        races={raceList}
        playerName={name}
        onComplete={handleCreateComplete}
      />
    );
  }

  if (!client) {
    return (
      <Box paddingX={1}>
        <Text color="yellow">Connecting...</Text>
      </Box>
    );
  }

  return (
    <GameView
      client={client}
      name={playerName || account?.handle || "Adventurer"}
      exit={exit}
    />
  );
}

// ── Game View (unchanged layout logic) ──

const ROOM_DESC_LINES = 3;
const ROOM_PANEL_HEIGHT = 7;
const CHROME_ROWS = 7; // status(3) + input(3) + hints(1)

function GameView({ client, name, exit }: { client: WsClient; name: string; exit: () => void }) {
  const { stdout } = useStdout();
  const state = useGameState(client);
  const [connecting, setConnecting] = useState(true);
  const [rows, setRows] = useState(stdout.rows ?? 24);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);

  useEffect(() => {
    if (state.connected) setConnecting(false);
  }, [state.connected]);

  // Handle portal offers — auto-switch server
  useEffect(() => {
    if (!state.portalOffer) return;
    const { websocketUrl, sessionId } = state.portalOffer;
    client.switchServer(websocketUrl, sessionId);
  }, [state.portalOffer, client]);

  // Track terminal resize
  useEffect(() => {
    const onResize = () => setRows(stdout.rows ?? 24);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  // Tab toggles info panel
  useInput((_input, key) => {
    if (key.tab) {
      setInfoPanelOpen((prev) => !prev);
    }
  });

  const handleCommand = useCallback(
    (input: string) => {
      if (input === "quit" || input === "disconnect") {
        client.disconnect();
        setTimeout(() => exit(), 200);
        return;
      }
      client.sendCommand(input);
    },
    [client, exit]
  );

  const inCombat = state.combat?.active ?? false;
  const cols = stdout.columns ?? 80;

  const contextPanelHeight = useMemo(() => {
    if (inCombat && state.combat) {
      const hasArt = state.combat.combatants.some((c) =>
        c.id === state.combat!.targetId && c.art && c.art.length > 0
      );
      return getCombatPanelHeight(state.combat.combatants.length, hasArt);
    }
    return ROOM_PANEL_HEIGHT;
  }, [inCombat, state.combat]);

  const fixedRows = CHROME_ROWS + contextPanelHeight + (infoPanelOpen ? INFO_PANEL_HEIGHT : 0);
  const narrativeHeight = Math.max(rows - fixedRows, 3);

  return (
    <Box flexDirection="column" height={rows}>
      {infoPanelOpen && (
        <InfoPanel state={state} playerName={name} width={cols} />
      )}

      <StatusBar state={state} playerName={name} connecting={connecting} />

      {inCombat && state.combat ? (
        <CombatPanel combat={state.combat} width={cols} />
      ) : state.room ? (
        <RoomPanel room={state.room} playerName={name} maxDescLines={ROOM_DESC_LINES} />
      ) : null}

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <NarrativeView lines={state.narrative} height={narrativeHeight} />
      </Box>

      <InputBar onSubmit={handleCommand} />
      <HintBar infoPanelOpen={infoPanelOpen} quests={state.quests} />
    </Box>
  );
}
