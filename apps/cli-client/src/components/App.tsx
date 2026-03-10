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

interface SystemData {
  classes: Record<string, { name: string; description: string; attributeBonuses?: Record<string, number>; spells?: string[]; tags?: string[] }>;
  races: Record<string, { name: string; description: string; attributeBonuses?: Record<string, number>; tags?: string[] }>;
}

interface Props {
  host: string;
  port: number;
  tls: boolean;
  name: string;
  classId?: string;
  raceId?: string;
  skipCreate?: boolean;
}

export function App({ host, port, tls, name, classId, raceId, skipCreate }: Props) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<"loading" | "create" | "play">(
    skipCreate ? "play" : "loading"
  );
  const [system, setSystem] = useState<SystemData | null>(null);
  const [finalClass, setFinalClass] = useState(classId ?? "warrior");
  const [finalRace, setFinalRace] = useState(raceId ?? "human");
  const [client, setClient] = useState<WsClient | null>(null);

  // Fetch system data for character creation
  useEffect(() => {
    if (phase !== "loading") return;

    const protocol = tls ? "https" : "http";
    const defaultPort = tls ? 443 : 80;
    const portSuffix = port === defaultPort ? "" : `:${port}`;
    const url = `${protocol}://${host}${portSuffix}/system`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setSystem(data as SystemData);
        setPhase("create");
      })
      .catch(() => {
        setPhase("play");
      });
  }, [phase, host, port, tls]);

  // Connect when entering play phase
  useEffect(() => {
    if (phase !== "play" || client) return;

    const c = new WsClient();
    c.connect({ host, port, tls, name, classId: finalClass, raceId: finalRace });
    setClient(c);
  }, [phase, client, host, port, tls, name, finalClass, finalRace]);

  const handleCreateComplete = useCallback((chosenClass: string, chosenRace: string) => {
    setFinalClass(chosenClass);
    setFinalRace(chosenRace);
    setPhase("play");
  }, []);

  if (phase === "loading") {
    return (
      <Box paddingX={1}>
        <Text color="yellow">Loading game system...</Text>
      </Box>
    );
  }

  if (phase === "create" && system) {
    const classList = Object.entries(system.classes).map(([id, def]) => ({ id, ...def }));
    const raceList = Object.entries(system.races).map(([id, def]) => ({ id, ...def }));

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

  return <GameView client={client} name={name} exit={exit} />;
}

// Layout height budget:
//   StatusBar:    3 rows (border + content + border)
//   RoomPanel:    7 rows (border + title + 3 desc + info + border)
//   CombatPanel:  variable (border + header + enemies + art/desc + border)
//   Narrative:    remaining (flex)
//   InputBar:     3 rows (border + content + border)
//   HintBar:      1 row
//   InfoPanel:    10 rows when open (border + 8 content + border)

const ROOM_DESC_LINES = 3;
const ROOM_PANEL_HEIGHT = 7; // border + title + 3 desc + info + border
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

  // Calculate the height of the context panel (room or combat)
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
      <HintBar infoPanelOpen={infoPanelOpen} />
    </Box>
  );
}
