// Core types derived from AT Proto lexicon schemas
// These mirror the lexicon definitions in /lexicons/com/cacheblasters/fm/

// ── Open map types ──
// Attributes, derived stats, item properties, and extensions are all open maps.
// This allows servers to define their own schemas without code changes.

/** Open map of attribute ID -> numeric value, e.g. { str: 14, dex: 12, sanity: 80 } */
export type Attributes = Record<string, number>;

/** Cached derived stats computed from server formulas, e.g. { maxHp: 50, maxMp: 30 } */
export type DerivedStats = Record<string, number>;

/** Server-specific extension data, keyed by server DID */
export type Extensions = Record<string, unknown>;

/** Open map of property ID -> value for items */
export type ItemProperties = Record<string, unknown>;

// ── Character ──

export interface CharacterProfile {
  name: string;
  class: string;
  race: string;
  level: number;
  experience: number;
  attributes: Attributes;
  derived?: DerivedStats;
  description?: string;
  homeServer?: string;
  extensions?: Extensions;
  createdAt: string;
  updatedAt?: string;
}

// ── System schema definitions (published by servers) ──

export interface AttributeDef {
  name: string;
  description: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  category?: string;
}

export interface ClassDef {
  name: string;
  description: string;
  baseAttributes?: Attributes;
  attributeBonuses?: Attributes;
  spells?: string[];
  tags?: string[];
}

export interface SpellDef {
  name: string;
  description: string;
  mpCost: number;
  /** Action point cost (defaults to 2 if not specified) */
  apCost?: number;
  levelRequired?: number;
  /** Attribute used for spell power scaling (e.g. "int", "wis") */
  attribute: string;
  effect: "damage" | "heal" | "buff" | "debuff";
  /** Base power before attribute scaling */
  power: number;
  /** Dice notation for variable component, e.g. "2d6" */
  dice?: string;
  /** Target type */
  target: "enemy" | "self" | "ally";
  tags?: string[];
}

export interface RaceDef {
  name: string;
  description: string;
  attributeBonuses?: Attributes;
  tags?: string[];
}

export interface EquipSlotDef {
  name: string;
  description?: string;
  category?: string;
  maxItems?: number;
  aliases?: string[];
}

export interface ItemTypeDef {
  name: string;
  description?: string;
  properties?: PropertyDef[];
  stackable?: boolean;
  equippable?: boolean;
  equipSlots?: string[];
  defaultSlot?: string;
}

export interface PropertyDef {
  id: string;
  name: string;
  valueType: "integer" | "number" | "string" | "boolean";
  description?: string;
}

export interface FormulaDef {
  name: string;
  description?: string;
  expression: string;
  min?: number;
  max?: number;
}

// ── World ──

export type Direction =
  | "north"
  | "south"
  | "east"
  | "west"
  | "up"
  | "down"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest";

export interface RoomExit {
  direction: Direction;
  target: string;
  portal?: boolean;
  requiredLevel?: number;
  description?: string;
}

export interface RoomRecord {
  title: string;
  description: string;
  area: string;
  coordinates: { x: number; y: number; z: number };
  exits?: RoomExit[];
  flags?: string[];
}

export interface AreaRecord {
  title: string;
  description: string;
  levelRange?: { min: number; max: number };
}

export interface ServerRecord {
  name: string;
  description: string;
  endpoint: string;
  xrpcEndpoint?: string;
  minLevel?: number;
  maxLevel?: number;
  theme?: string;
  maxPlayers?: number;
  createdAt: string;
}

export interface FlagRecord {
  name: string;
  description: string;
  effects?: FlagEffect[];
}

export interface FlagEffect {
  type: string;
  value?: number;
  description?: string;
}

// ── Items ──

export interface ItemDefinition {
  name: string;
  type: string;
  description: string;
  weight?: number;
  value?: number;
  rarity?: string;
  levelRequired?: number;
  stackable?: boolean;
  maxStack?: number;
  properties?: ItemProperties;
  tags?: string[];
}

// ── NPCs ──

export type NpcBehavior = "hostile" | "merchant" | "questgiver" | "wanderer" | "static";

export interface DialogueNode {
  text: string;
  responses?: DialogueResponse[];
}

export interface DialogueResponse {
  text: string;
  next?: string;
}

export interface NpcDefinition {
  name: string;
  description: string;
  behavior: NpcBehavior;
  level?: number;
  attributes?: Attributes;
  dialogue?: Record<string, DialogueNode>;
  tags?: string[];
}

// ── NSID constants ──

export const NSID = {
  // Character
  CharacterProfile: "com.cacheblasters.fm.character.profile",

  // System schema
  SystemAttribute: "com.cacheblasters.fm.system.attribute",
  SystemClass: "com.cacheblasters.fm.system.class",
  SystemRace: "com.cacheblasters.fm.system.race",
  SystemEquipSlot: "com.cacheblasters.fm.system.equipSlot",
  SystemItemType: "com.cacheblasters.fm.system.itemType",
  SystemFormula: "com.cacheblasters.fm.system.formula",

  // World
  WorldServer: "com.cacheblasters.fm.world.server",
  WorldArea: "com.cacheblasters.fm.world.area",
  WorldRoom: "com.cacheblasters.fm.world.room",
  WorldFlag: "com.cacheblasters.fm.world.flag",

  // Items
  ItemDefinition: "com.cacheblasters.fm.item.definition",

  // NPCs
  NpcDefinition: "com.cacheblasters.fm.npc.definition",

  // Actions
  ActionConnect: "com.cacheblasters.fm.action.connect",
} as const;
