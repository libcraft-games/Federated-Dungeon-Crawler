import React from "react";
import { Box, Text } from "ink";
import type { RoomState } from "@realms/common";

interface Props {
  room: RoomState;
  playerName: string;
  maxDescLines?: number;
}

export function RoomPanel({ room, playerName, maxDescLines = 3 }: Props) {
  const otherPlayers = room.players.filter((p) => p.name !== playerName);

  // Build the info line parts
  const infoParts: string[] = [];
  if (otherPlayers.length > 0) {
    infoParts.push(`Players: ${otherPlayers.map((p) => p.name).join(", ")}`);
  }
  if (room.npcs.length > 0) {
    infoParts.push(`NPCs: ${room.npcs.map((n) => n.name).join(", ")}`);
  }
  if (room.items.length > 0) {
    const itemList = room.items
      .map((i) => {
        const qty = i.quantity > 1 ? ` (x${i.quantity})` : "";
        return `${i.name}${qty}`;
      })
      .join(", ");
    infoParts.push(`Items: ${itemList}`);
  }
  if (room.features && room.features.length > 0) {
    infoParts.push(`Objects: ${room.features.map((f) => f.name).join(", ")}`);
  }

  const exits = room.exits.map((e) => e.direction);
  const safeTag = room.flags.includes("safe") ? " [safe]" : "";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="cyan">
        {room.title}
      </Text>
      <Box height={maxDescLines} overflow="hidden">
        <Text color="white" wrap="wrap">
          {room.description.trim()}
        </Text>
      </Box>
      <Box justifyContent="space-between">
        <Text>
          {infoParts.length > 0 ? (
            infoParts.map((part, i) => (
              <Text key={i}>
                {i > 0 && <Text color="gray"> </Text>}
                <Text color="yellow">{part}</Text>
              </Text>
            ))
          ) : (
            <Text dimColor>Nothing of note here.</Text>
          )}
        </Text>
        <Text>
          <Text color="gray">Exits: </Text>
          <Text color="yellow">{exits.join(", ")}</Text>
          <Text color="cyan">{safeTag}</Text>
        </Text>
      </Box>
    </Box>
  );
}
