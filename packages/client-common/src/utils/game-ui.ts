import type { MapState } from "../hooks/use-game-state.js";

export const SLOT_LABELS: Record<string, string> = {
  mainHand: "Weap",
  offHand: "Off",
  head: "Head",
  body: "Body",
  feet: "Feet",
  ring: "Ring",
};

export type HpLevel = "high" | "mid" | "low";

export function hpLevel(hp: number, max: number): HpLevel {
  if (hp <= max * 0.25) return "low";
  if (hp <= max * 0.5) return "mid";
  return "high";
}

export function viewportMap(map: MapState, viewWidth: number, viewHeight: number): string[] {
  const { grid, cursorRow, cursorCol } = map;
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
    const sliced = row.length > startCol ? row.slice(startCol, startCol + viewWidth) : "";
    lines.push(sliced);
  }
  return lines;
}
