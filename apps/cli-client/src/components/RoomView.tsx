import React from "react";
import { Box, Text } from "ink";
import type { RoomState } from "@realms/common";

interface Props {
  room: RoomState;
  playerName: string;
}

export function RoomView({ room, playerName }: Props) {
  const otherPlayers = room.players.filter((p) => p.name !== playerName);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {room.title}
      </Text>
      <Text color="white" wrap="wrap">
        {room.description}
      </Text>

      {otherPlayers.length > 0 && (
        <Text color="gray">Players: {otherPlayers.map((p) => p.name).join(", ")}</Text>
      )}

      {room.npcs.length > 0 && (
        <Text color="yellow">NPCs: {room.npcs.map((n) => n.name).join(", ")}</Text>
      )}

      {room.items.length > 0 && (
        <Text color="gray">
          Items:{" "}
          {room.items
            .map((i) => {
              const qty = i.quantity > 1 ? ` (x${i.quantity})` : "";
              return `${i.name}${qty}`;
            })
            .join(", ")}
        </Text>
      )}

      {room.flags.length > 0 && <Text dimColor>[{room.flags.join(", ")}]</Text>}

      <Text>
        <Text color="gray">Exits: </Text>
        {room.exits.map((e, i) => (
          <Text key={e.direction}>
            {i > 0 && <Text color="gray">, </Text>}
            <Text color="yellow">{e.direction}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
