import React from "react";
import { Box, Text } from "ink";
import type { NarrativeLine } from "../hooks/use-game-state.js";

interface Props {
  lines: NarrativeLine[];
  maxLines?: number;
}

const STYLE_COLORS: Record<string, string> = {
  info: "white",
  error: "red",
  combat: "redBright",
  system: "cyan",
  chat: "green",
};

export function NarrativeView({ lines, maxLines = 20 }: Props) {
  const visible = lines.slice(-maxLines);

  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((line, i) => (
        <Text key={i} color={STYLE_COLORS[line.style] ?? "white"} wrap="wrap">
          {line.text}
        </Text>
      ))}
    </Box>
  );
}
