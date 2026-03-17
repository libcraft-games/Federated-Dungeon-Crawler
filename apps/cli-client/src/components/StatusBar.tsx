import React from "react";
import { Box, Text } from "ink";
import type { GameState } from "../hooks/use-game-state.js";

interface Props {
  state: GameState;
  playerName: string;
  connecting?: boolean;
}

function StatGauge({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  return (
    <Text>
      <Text color="gray">{label} </Text>
      <Text color={color} bold>
        {current}
      </Text>
      <Text color="gray">/{max}</Text>
    </Text>
  );
}

export function StatusBar({ state, playerName, connecting }: Props) {
  const { room, connected, serverName, stats } = state;

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
        <Text color="green" bold>
          {playerName}
        </Text>
        {stats && <Text color="gray"> [Lv {stats.level}]</Text>}
        <Text color="gray"> | </Text>
        <Text color="cyan">{room?.title ?? "..."}</Text>
      </Text>
      <Box gap={1}>
        {stats && (
          <>
            <StatGauge
              label="HP"
              current={stats.hp}
              max={stats.maxHp}
              color={
                stats.hp <= stats.maxHp * 0.25
                  ? "red"
                  : stats.hp <= stats.maxHp * 0.5
                    ? "yellow"
                    : "green"
              }
            />
            <StatGauge label="MP" current={stats.mp} max={stats.maxMp} color="blue" />
            <StatGauge label="AP" current={stats.ap} max={stats.maxAp} color="magenta" />
            <Text>
              <Text color="gray">G </Text>
              <Text color="yellow" bold>
                {stats.gold}
              </Text>
            </Text>
          </>
        )}
        <Text color="gray">{serverName ?? ""}</Text>
      </Box>
    </Box>
  );
}
