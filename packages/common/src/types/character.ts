import type {
  CharacterProfile,
  Attributes,
  DerivedStats,
  ClassDef,
  RaceDef,
  AttributeDef,
  FormulaDef,
} from "@realms/lexicons";
import type { ItemInstance } from "./item.js";

export interface CharacterState extends CharacterProfile {
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  currentAp: number;
  maxAp: number;
  currentRoom: string;
  activeEffects: ActiveEffect[];
  inventory: ItemInstance[];
  equipment: Record<string, ItemInstance>;
}

export interface ActiveEffect {
  id: string;
  name: string;
  type: "buff" | "debuff";
  attribute?: string;
  magnitude: number;
  remainingTicks: number;
}

// ── Game System ──
// A GameSystem defines all the rules a server uses. It's loaded from the
// server's published system.* records, or from a bundled default.

export interface GameSystem {
  attributes: Record<string, AttributeDef>;
  classes: Record<string, ClassDef>;
  races: Record<string, RaceDef>;
  formulas: Record<string, FormulaDef>;
}

// ── Formula evaluation ──
// Simple expression evaluator for derived stat formulas.
// Supports: +, -, *, /, parentheses, floor(), ceil(), min(), max(), and variable references.

export function evaluateFormula(
  expression: string,
  variables: Record<string, number>
): number {
  // Replace variable names with their values (longest first to avoid partial matches)
  let expr = expression;
  const sortedVars = Object.entries(variables).sort(
    ([a], [b]) => b.length - a.length
  );
  for (const [name, value] of sortedVars) {
    expr = expr.replaceAll(name, String(value));
  }

  // Evaluate with a safe subset — no access to globals
  // Replace math functions with Math.*
  expr = expr
    .replace(/\bfloor\b/g, "Math.floor")
    .replace(/\bceil\b/g, "Math.ceil")
    .replace(/\bmin\b/g, "Math.min")
    .replace(/\bmax\b/g, "Math.max")
    .replace(/\babs\b/g, "Math.abs");

  // Validate: after variable substitution and math function replacement,
  // only allow digits, operators, parens, commas, whitespace, and Math.*
  // Reject any other identifiers (prevents access to process, globalThis, etc.)
  const sanitized = expr.replace(/Math\.(floor|ceil|min|max|abs)/g, "0");
  if (!/^[\d\s+\-*/().,]*$/.test(sanitized)) {
    throw new Error(`Invalid formula expression: ${expression}`);
  }

  try {
    const fn = new Function("Math", `"use strict"; return (${expr});`);
    const result = fn(Math);
    return typeof result === "number" && isFinite(result) ? Math.floor(result) : 0;
  } catch {
    throw new Error(`Failed to evaluate formula: ${expression}`);
  }
}

// ── Derived stat computation ──

export function computeDerivedStats(
  formulas: Record<string, FormulaDef>,
  level: number,
  attributes: Attributes
): DerivedStats {
  const variables: Record<string, number> = { level, ...attributes };
  const derived: DerivedStats = {};

  for (const [id, formula] of Object.entries(formulas)) {
    let value = evaluateFormula(formula.expression, variables);
    if (formula.min !== undefined) value = Math.max(value, formula.min);
    if (formula.max !== undefined) value = Math.min(value, formula.max);
    derived[id] = value;
  }

  return derived;
}

// ── Character creation ──

export function buildAttributes(
  system: GameSystem,
  classId: string,
  raceId: string
): Attributes {
  const attrs: Attributes = {};

  // Start with default values from attribute definitions
  for (const [id, def] of Object.entries(system.attributes)) {
    attrs[id] = def.defaultValue ?? 10;
  }

  // Apply class bonuses
  const classDef = system.classes[classId];
  if (classDef?.attributeBonuses) {
    for (const [id, bonus] of Object.entries(classDef.attributeBonuses)) {
      attrs[id] = (attrs[id] ?? 0) + bonus;
    }
  }

  // Apply race bonuses
  const raceDef = system.races[raceId];
  if (raceDef?.attributeBonuses) {
    for (const [id, bonus] of Object.entries(raceDef.attributeBonuses)) {
      attrs[id] = (attrs[id] ?? 0) + bonus;
    }
  }

  return attrs;
}

export function profileToState(
  profile: CharacterProfile,
  currentRoom: string,
  formulas: Record<string, FormulaDef>
): CharacterState {
  const derived = computeDerivedStats(formulas, profile.level, profile.attributes);

  return {
    ...profile,
    currentHp: derived.maxHp ?? 20,
    maxHp: derived.maxHp ?? 20,
    currentMp: derived.maxMp ?? 0,
    maxMp: derived.maxMp ?? 0,
    currentAp: derived.maxAp ?? 4,
    maxAp: derived.maxAp ?? 4,
    currentRoom,
    activeEffects: [],
    inventory: [],
    equipment: {},
  };
}
