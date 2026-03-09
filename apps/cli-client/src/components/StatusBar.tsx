import React from "react";
import { Box, Text } from "ink";
import type { GameState } from "../hooks/use-game-state.js";

interface Props {
  state: GameState;
  playerName: string;
  connecting?: boolean;
}

export function StatusBar({ state, playerName, connecting }: Props) {
  const { room, connected, serverName } = state;

  if (!connected) {
    return (
      <Box borderStyle="single" borderColor={connecting ? "yellow" : "red"} paddingX={1}>
        <Text color={connecting ? "yellow" : "red"}>
          {connecting ? "Connecting..." : "Disconnected"}
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text>
        <Text color="green" bold>{playerName}</Text>
        <Text color="gray"> | </Text>
        <Text color="cyan">{room?.title ?? "..."}</Text>
      </Text>
      <Text color="gray">
        {serverName ?? "Unknown Server"}
      </Text>
    </Box>
  );
}
