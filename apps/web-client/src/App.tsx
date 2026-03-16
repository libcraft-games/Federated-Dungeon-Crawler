import { useCallback, useState, useEffect } from "react";
import { WsClient } from "./connection/ws-client.js";
import { useGameState } from "./hooks/use-game-state.js";
import { SPLASH_ART, SPLASH_TITLE, SPLASH_SUBTITLE, SPLASH_BYLINE } from "@realms/client-common";
import { saveProfile, loadProfile } from "./connection/profile-storage.js";
import { StatusBar } from "./components/StatusBar.js";
import { RoomPanel } from "./components/RoomPanel.js";
import { CombatPanel } from "./components/CombatPanel.js";
import { NarrativeView } from "./components/NarrativeView.js";
import { InputBar } from "./components/InputBar.js";
import { HintBar } from "./components/HintBar.js";
import { InfoPanel } from "./components/InfoPanel.js";
import { CharacterCreate } from "./pages/CharacterCreate.js";
import { ServerSelect } from "./pages/ServerSelect.js";
import "./App.css";

type AppPhase = "splash" | "account" | "server" | "create" | "play";

interface SystemData {
  classes: Record<
    string,
    {
      name: string;
      description: string;
      attributeBonuses?: Record<string, number>;
      spells?: string[];
      tags?: string[];
    }
  >;
  races: Record<
    string,
    {
      name: string;
      description: string;
      attributeBonuses?: Record<string, number>;
      tags?: string[];
    }
  >;
}

interface ServerInfo {
  name: string;
  description: string;
  players: number;
  rooms: number;
}

export function App() {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [serverUrl, setServerUrl] = useState("");
  const [system, setSystem] = useState<SystemData | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [finalClass, setFinalClass] = useState("warrior");
  const [finalRace, setFinalRace] = useState("human");
  const [client, setClient] = useState<WsClient | null>(null);

  // -- Phase transitions --

  const handleServerConnect = useCallback(
    (url: string, info: ServerInfo) => {
      setServerUrl(url);
      saveProfile({
        handle: playerName || "Adventurer",
        did: "",
        pdsUrl: "",
        lastServer: url,
        lastServerName: info.name,
      });

      fetch(`${url}/system`)
        .then((res) => res.json())
        .then((data) => {
          setSystem(data as SystemData);
          setPhase("create");
        })
        .catch(() => {
          setPhase("play");
        });
    },
    [playerName],
  );

  const handleCreateComplete = useCallback((chosenClass: string, chosenRace: string) => {
    setFinalClass(chosenClass);
    setFinalRace(chosenRace);
    setPhase("play");
  }, []);

  // -- Connect when entering play phase --

  useEffect(() => {
    if (phase !== "play" || client) return;

    const c = new WsClient();

    if (serverUrl) {
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

    setClient(c);
  }, [phase, client, serverUrl, playerName, finalClass, finalRace]);

  // -- Render phases --

  if (phase === "splash") {
    return (
      <div className="splash-container">
        <pre className="splash-art">{SPLASH_ART.join("\n")}</pre>
        <div className="splash-title">{SPLASH_TITLE}</div>
        <div className="splash-subtitle">{SPLASH_SUBTITLE}</div>
        <div className="dim">{SPLASH_BYLINE}</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="page-button page-button-primary" onClick={() => setPhase("account")}>
            Enter the Realm
          </button>
        </div>
      </div>
    );
  }

  if (phase === "account") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Account</h2>
        <p className="dim">
          Choose how to connect. Dev mode lets you play without an AT Proto account.
        </p>
        <div className="account-modes">
          <div
            className="account-mode-card"
            onClick={() => {
              setPlayerName("");
              setPhase("server");
            }}
          >
            <div style={{ color: "var(--color-green)", fontWeight: "bold" }}>Dev Mode</div>
            <div className="dim">Play without auth</div>
          </div>
          <div className="account-mode-card" style={{ opacity: 0.5 }}>
            <div style={{ color: "var(--color-cyan)", fontWeight: "bold" }}>AT Proto Login</div>
            <div className="dim">Coming soon</div>
          </div>
        </div>
        <div>
          <label className="dim">Display name:</label>
          <input
            className="page-input"
            style={{ marginTop: "4px", width: "100%" }}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Adventurer"
            spellCheck={false}
          />
        </div>
        <button className="page-button page-button-primary" onClick={() => setPhase("server")}>
          Continue
        </button>
      </div>
    );
  }

  if (phase === "server") {
    const saved = loadProfile();
    return <ServerSelect savedProfile={saved} onConnect={handleServerConnect} />;
  }

  if (phase === "create" && system) {
    const classList = Object.entries(system.classes).map(([id, def]) => ({
      id,
      ...def,
    }));
    const raceList = Object.entries(system.races).map(([id, def]) => ({
      id,
      ...def,
    }));
    const name = playerName || "Adventurer";

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
      <div className="splash-container">
        <div style={{ color: "var(--color-yellow)" }}>Connecting...</div>
      </div>
    );
  }

  return <GameView client={client} name={playerName || "Adventurer"} />;
}

// -- Game View --

function GameView({ client, name }: { client: WsClient; name: string }) {
  const state = useGameState(client);
  const [connecting, setConnecting] = useState(true);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);

  useEffect(() => {
    if (state.connected) setConnecting(false);
  }, [state.connected]);

  // Portal auto-switch
  useEffect(() => {
    if (!state.portalOffer) return;
    const { websocketUrl, sessionId } = state.portalOffer;
    client.switchServer(websocketUrl, sessionId);
  }, [state.portalOffer, client]);

  // Tab key toggles info panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") {
        e.preventDefault();
        setInfoPanelOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCommand = useCallback(
    (input: string) => {
      client.sendCommand(input);
    },
    [client],
  );

  const inCombat = state.combat?.active ?? false;

  return (
    <div className="game-layout">
      {infoPanelOpen && <InfoPanel state={state} playerName={name} />}

      <StatusBar state={state} playerName={name} connecting={connecting} />

      {inCombat && state.combat ? (
        <CombatPanel combat={state.combat} onCommand={handleCommand} />
      ) : state.room ? (
        <RoomPanel room={state.room} playerName={name} onCommand={handleCommand} />
      ) : null}

      <NarrativeView lines={state.narrative} />

      <InputBar onSubmit={handleCommand} />
      <HintBar
        infoPanelOpen={infoPanelOpen}
        quests={state.quests}
        onToggleInfo={() => setInfoPanelOpen((prev) => !prev)}
      />
    </div>
  );
}
