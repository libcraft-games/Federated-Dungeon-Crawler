import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { WsClient } from "../connection/ws-client.js";
import { useGameState } from "../hooks/use-game-state.js";
import { StatusBar } from "./StatusBar.js";
import { RoomView } from "./RoomView.js";
import { NarrativeView } from "./NarrativeView.js";
import { InputBar } from "./InputBar.js";
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
      .then((data: SystemData) => {
        setSystem(data);
        setPhase("create");
      })
      .catch(() => {
        // If we can't fetch system, fall back to defaults
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

  // Play phase
  if (!client) {
    return (
      <Box paddingX={1}>
        <Text color="yellow">Connecting...</Text>
      </Box>
    );
  }

  return <GameView client={client} name={name} exit={exit} />;
}

function GameView({ client, name, exit }: { client: WsClient; name: string; exit: () => void }) {
  const state = useGameState(client);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    if (state.connected) setConnecting(false);
  }, [state.connected]);

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

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar state={state} playerName={name} connecting={connecting} />

      {state.room && (
        <RoomView room={state.room} playerName={name} />
      )}

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <NarrativeView lines={state.narrative} />
      </Box>

      <InputBar onSubmit={handleCommand} />
    </Box>
  );
}
