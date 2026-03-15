import React from "react";
import { Box, Text } from "ink";
import type { CombatState } from "../hooks/use-game-state.js";

interface Props {
  combat: CombatState;
  width: number;
}

const ART_MAX_LINES = 6;

function EnemyBar({
  name,
  level,
  hp,
  maxHp,
  isTarget,
}: {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  isTarget: boolean;
}) {
  const ratio = maxHp > 0 ? Math.min(hp / maxHp, 1) : 0;
  const barWidth = 16;
  const filled = Math.round(ratio * barWidth);
  const empty = barWidth - filled;
  const hpColor = ratio <= 0.25 ? "red" : ratio <= 0.5 ? "yellow" : "green";
  const marker = isTarget ? ">" : " ";

  return (
    <Box>
      <Text color={isTarget ? "red" : "gray"} bold={isTarget}>
        {marker}{" "}
      </Text>
      <Text color={isTarget ? "white" : "gray"} bold={isTarget}>
        {name}
      </Text>
      <Text color="gray"> (Lv.{level}) </Text>
      <Text color={hpColor}>{"█".repeat(filled)}</Text>
      <Text color="gray" dimColor>
        {"░".repeat(empty)}
      </Text>
      <Text> </Text>
      <Text color={hpColor} bold>
        {hp}
      </Text>
      <Text color="gray">/{maxHp}</Text>
    </Box>
  );
}

export function CombatPanel({ combat }: Props) {
  const { combatants, targetId } = combat;
  const target = combatants.find((c) => c.id === targetId) ?? combatants[0];

  // Layout: left side = art (if available), right side = description
  const hasArt = target?.art && target.art.length > 0;
  const artLines = hasArt ? target.art!.slice(0, ART_MAX_LINES) : [];

  // Trim description to first sentence or first line
  const desc = target?.description?.trim().split("\n")[0] ?? "";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="red"
      paddingX={1}
      overflow="hidden"
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="red">
          COMBAT
        </Text>
        <Text color="gray" dimColor>
          attack · defend · cast · flee · use
        </Text>
      </Box>

      {/* Enemy list with HP bars */}
      {combatants.map((c) => (
        <EnemyBar
          key={c.id}
          name={c.name}
          level={c.level}
          hp={c.hp}
          maxHp={c.maxHp}
          isTarget={c.id === targetId}
        />
      ))}

      {/* Art + Description row */}
      {(hasArt || desc) && (
        <Box marginTop={combatants.length > 0 ? 0 : 0}>
          {hasArt && (
            <Box flexDirection="column" marginRight={2}>
              {artLines.map((line, i) => (
                <Text key={i} color="yellow">
                  {line}
                </Text>
              ))}
            </Box>
          )}
          {desc && (
            <Box flexShrink={1}>
              <Text color="gray" wrap="truncate-end">
                {desc}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Height of the combat panel in rows */
export function getCombatPanelHeight(combatantCount: number, hasArt: boolean): number {
  // borders(2) + header(1) + enemies + art/desc area
  const artRows = hasArt ? ART_MAX_LINES : 1; // 1 for description line
  return 2 + 1 + combatantCount + artRows;
}
