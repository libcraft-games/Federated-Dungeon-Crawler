import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { WsClient } from "../connection/ws-client.js";
import { useGameState } from "../hooks/use-game-state.js";
import { StatusBar } from "./StatusBar.js";
import { RoomView } from "./RoomView.js";
import { NarrativeView } from "./NarrativeView.js";
import { InputBar } from "./InputBar.js";

interface Props {
  host: string;
  port: number;
  tls: boolean;
  name: string;
  classId: string;
  raceId: string;
}

export function App({ host, port, tls, name, classId, raceId }: Props) {
  const { exit } = useApp();

  const client = useMemo(() => {
    const c = new WsClient();
    c.connect({ host, port, tls, name, classId, raceId });
    return c;
  }, [host, port, tls, name, classId, raceId]);

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
