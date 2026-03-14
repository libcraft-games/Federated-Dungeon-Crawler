import React from "react";
import { Box, Text } from "ink";
import type { GameState, MapState, EquipmentMap } from "../hooks/use-game-state.js";

interface Props {
  state: GameState;
  playerName: string;
  width: number;
}

const CONTENT_ROWS = 8;

const SLOT_LABELS: Record<string, string> = {
  mainHand: "Weap",
  offHand: "Off",
  head: "Head",
  body: "Body",
  feet: "Feet",
  ring: "Ring",
};

function Bar({ current, max, color, width = 16 }: { current: number; max: number; color: string; width?: number }) {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color="gray" dimColor>{"░".repeat(empty)}</Text>
    </Text>
  );
}

function StatRow({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
  return (
    <Box>
      <Box width={4}>
        <Text color="gray">{label}</Text>
      </Box>
      <Bar current={current} max={max} color={color} />
      <Text> </Text>
      <Text color={color} bold>{current}</Text>
      <Text color="gray">/{max}</Text>
    </Box>
  );
}

function Divider() {
  return (
    <Box flexDirection="column" paddingX={1}>
      {Array.from({ length: CONTENT_ROWS }, (_, i) => (
        <Text key={i} dimColor>│</Text>
      ))}
    </Box>
  );
}

/** Viewport the map grid, centered on the cursor position */
function viewportMap(map: MapState, viewWidth: number, viewHeight: number): string[] {
  const { grid, cursorRow, cursorCol } = map;

  // Calculate viewport window centered on cursor
  const halfW = Math.floor(viewWidth / 2);
  const halfH = Math.floor(viewHeight / 2);

  const startRow = Math.max(0, cursorRow - halfH);
  const startCol = Math.max(0, cursorCol - halfW);

  const lines: string[] = [];
  for (let r = 0; r < viewHeight; r++) {
    const gridRow = startRow + r;
    if (gridRow >= grid.length) {
      lines.push("");
      continue;
    }
    const row = grid[gridRow] ?? "";
    // Slice the visible columns
    const sliced = row.length > startCol ? row.slice(startCol, startCol + viewWidth) : "";
    lines.push(sliced);
  }

  return lines;
}

export function InfoPanel({ state, playerName, width }: Props) {
  const { stats, inventory, equipment, map } = state;

  // Column widths (accounting for borders + padding + dividers)
  const innerWidth = Math.max(width - 6, 30); // subtract borders + padding
  const statsWidth = Math.floor(innerWidth * 0.25);
  const gearWidth = Math.floor(innerWidth * 0.2);
  const invWidth = Math.floor(innerWidth * 0.2);
  const mapWidth = innerWidth - statsWidth - gearWidth - invWidth - 9; // subtract divider padding (3 dividers)

  return (
    <Box
      borderStyle="single"
      borderColor="magenta"
      paddingX={1}
      flexDirection="row"
    >
      {/* Left: Character stats */}
      <Box flexDirection="column" width={statsWidth}>
        <Text bold color="magenta">Character</Text>
        {stats ? (
          <>
            <Text>
              <Text color="green" bold>{playerName}</Text>
              <Text color="gray"> — Level </Text>
              <Text color="white" bold>{stats.level}</Text>
            </Text>
            <Text> </Text>
            <StatRow
              label="HP"
              current={stats.hp}
              max={stats.maxHp}
              color={stats.hp <= stats.maxHp * 0.25 ? "red" : stats.hp <= stats.maxHp * 0.5 ? "yellow" : "green"}
            />
            <StatRow label="MP" current={stats.mp} max={stats.maxMp} color="blue" />
            <StatRow label="AP" current={stats.ap} max={stats.maxAp} color="magenta" />
            <Text> </Text>
            <Box>
              <Box width={4}>
                <Text color="gray">XP</Text>
              </Box>
              <Bar current={stats.xp} max={stats.xp + stats.xpToNext} color="yellow" />
              <Text> </Text>
              <Text color="yellow">{stats.xpToNext}</Text>
              <Text color="gray"> to next</Text>
            </Box>
          </>
        ) : (
          <Text dimColor>No stats yet.</Text>
        )}
      </Box>

      <Divider />

      {/* Center: Inventory */}
      <Box flexDirection="column" width={invWidth}>
        <Text bold color="magenta">Inventory</Text>
        {inventory.length > 0 ? (
          inventory.slice(0, CONTENT_ROWS - 1).map((item, i) => (
            <Text key={i} color="white">
              <Text color="gray"> </Text>
              {item.name}
              {item.quantity > 1 && <Text color="gray"> (x{item.quantity})</Text>}
            </Text>
          ))
        ) : (
          <Text dimColor> Empty</Text>
        )}
        {inventory.length > CONTENT_ROWS - 1 && (
          <Text dimColor> +{inventory.length - (CONTENT_ROWS - 1)} more</Text>
        )}
      </Box>

      <Divider />

      {/* Gear: Equipment slots */}
      <Box flexDirection="column" width={gearWidth}>
        <Text bold color="magenta">Gear</Text>
        {Object.keys(equipment).length > 0 ? (
          Object.entries(equipment).slice(0, CONTENT_ROWS - 1).map(([slot, item]) => (
            <Text key={slot} color="white">
              <Text color="gray">{(SLOT_LABELS[slot] ?? slot).padEnd(4)} </Text>
              <Text>{item.name}</Text>
            </Text>
          ))
        ) : (
          <Text dimColor> None</Text>
        )}
      </Box>

      <Divider />

      {/* Right: Map (viewported, centered on player) */}
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="magenta">Map <Text dimColor>[@]=you [+]=visited</Text></Text>
        {map ? (
          viewportMap(map, mapWidth, CONTENT_ROWS - 1).map((line, i) => (
            <Text key={i} color="cyan" wrap="truncate-end">{line || " "}</Text>
          ))
        ) : (
          <Text dimColor> Explore to reveal.</Text>
        )}
      </Box>
    </Box>
  );
}

/** Height of the info panel in rows (borders + content) */
export const INFO_PANEL_HEIGHT = CONTENT_ROWS + 2; // borders top + bottom
