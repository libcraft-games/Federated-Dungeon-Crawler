import type { RoomState, EntityBrief, ItemBrief, ItemInstance } from "@realms/common";

// ── Shared combat types ──

export interface CombatantInfo {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  description?: string;
  art?: string[];
}

// Client -> Server messages
export type ClientMessage =
  | { type: "command"; id: string; command: string; args: string[] }
  | { type: "move"; id: string; direction: string }
  | { type: "chat"; channel: string; message: string }
  | { type: "interact"; id: string; targetId: string; action: string }
  | { type: "ping" };

// Server -> Client messages
export type ServerMessage =
  | { type: "room_state"; room: RoomState }
  | { type: "narrative"; text: string; style?: "info" | "error" | "combat" | "system" | "chat" }
  | { type: "entity_enter"; entity: EntityBrief; room: string }
  | { type: "entity_leave"; entity: EntityBrief; room: string; direction?: string }
  | { type: "chat"; channel: string; sender: string; message: string }
  | { type: "error"; code: string; message: string }
  | { type: "ack"; id: string }
  | { type: "pong"; serverTime: number }
  | { type: "welcome"; sessionId: string; serverName: string }
  | { type: "inventory_update"; inventory: ItemInstance[] }
  | {
      type: "character_update";
      hp: number;
      maxHp: number;
      mp: number;
      maxMp: number;
      ap: number;
      maxAp: number;
      level: number;
      xp: number;
      xpToNext: number;
    }
  | { type: "combat_start"; target: string; combatants: CombatantInfo[] }
  | { type: "combat_update"; combatants: CombatantInfo[]; targetId: string }
  | { type: "combat_end"; reason: "victory" | "flee" | "death" }
  | { type: "level_up"; level: number; message: string }
  | { type: "map_update"; grid: string[]; cursorRow: number; cursorCol: number; legend: string[] };

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.type === "string") {
      return parsed as ClientMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function decodeServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.type === "string") {
      return parsed as ServerMessage;
    }
    return null;
  } catch {
    return null;
  }
}
