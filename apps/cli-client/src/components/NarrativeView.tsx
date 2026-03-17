import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { NarrativeLine } from "../hooks/use-game-state.js";

interface Props {
  lines: NarrativeLine[];
  height: number;
}

const STYLE_COLORS: Record<string, string> = {
  info: "white",
  error: "red",
  combat: "redBright",
  system: "cyan",
  chat: "green",
  room: "cyanBright",
};

const SCROLL_STEP = 5;

export function NarrativeView({ lines, height }: Props) {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Auto-scroll to bottom when new lines arrive (if already at bottom)
  useEffect(() => {
    if (scrollOffset === 0) return; // already at bottom, nothing to do
    // Don't reset if user has scrolled up — they're reading history
  }, [lines.length]);

  // Reset scroll to bottom when new content arrives and user is near bottom
  useEffect(() => {
    if (scrollOffset <= SCROLL_STEP) {
      setScrollOffset(0);
    }
  }, [lines.length]);

  useInput((_input, key) => {
    if (key.pageUp) {
      setScrollOffset((prev) => Math.min(prev + SCROLL_STEP, Math.max(lines.length - height, 0)));
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.max(prev - SCROLL_STEP, 0));
    }
  });

  const maxVisible = Math.max(height, 1);
  const endIndex = lines.length - scrollOffset;
  const startIndex = Math.max(0, endIndex - maxVisible);
  const visible = lines.slice(startIndex, endIndex);
  const emptyLines = Math.max(0, maxVisible - visible.length);

  const isAtBottom = scrollOffset === 0;
  return (
    <Box flexDirection="column" paddingX={1} height={height}>
      {emptyLines > 0 && <Box height={emptyLines} />}
      {visible.map((line, i) => (
        <Text
          key={startIndex + i}
          color={STYLE_COLORS[line.style] ?? "white"}
          bold={line.style === "room"}
          wrap="truncate-end"
        >
          {line.text}
        </Text>
      ))}
      {!isAtBottom && (
        <Box position="absolute" marginLeft={-1}>
          <Text color="yellow" dimColor>
            {" "}
            PgUp/PgDn to scroll ({scrollOffset} lines up)
          </Text>
        </Box>
      )}
    </Box>
  );
}
