import { useState, useEffect, useCallback } from "react";
import type { ServerMessage, CombatantInfo } from "@realms/protocol";
import type { RoomState, ItemInstance } from "@realms/common";
import type { WsClient } from "../connection/ws-client.js";

export type EquipmentMap = Record<string, ItemInstance>;

export interface NarrativeLine {
  text: string;
  style: "info" | "error" | "combat" | "system" | "chat" | "room";
  timestamp: number;
}

export interface CharacterStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ap: number;
  maxAp: number;
  gold: number;
  level: number;
  xp: number;
  xpToNext: number;
}

export interface MapState {
  /** Raw grid rows */
  grid: string[];
  /** Row of the player cursor in the grid */
  cursorRow: number;
  /** Column of the player cursor in the grid */
  cursorCol: number;
  /** Room name legend */
  legend: string[];
}

export interface CombatState {
  active: boolean;
  combatants: CombatantInfo[];
  targetId: string;
}

export interface GameState {
  connected: boolean;
  sessionId: string | null;
  serverName: string | null;
  room: RoomState | null;
  stats: CharacterStats | null;
  map: MapState | null;
  combat: CombatState | null;
  inventory: ItemInstance[];
  equipment: EquipmentMap;
  narrative: NarrativeLine[];
}

const MAX_NARRATIVE = 500;

export function useGameState(client: WsClient) {
  const [state, setState] = useState<GameState>({
    connected: false,
    sessionId: null,
    serverName: null,
    room: null,
    stats: null,
    map: null,
    combat: null,
    inventory: [],
    equipment: {},
    narrative: [],
  });

  const addNarrative = useCallback((text: string, style: NarrativeLine["style"] = "info") => {
    // Split multi-line text into individual entries for accurate height tracking
    const entries = text.split("\n").map((line) => ({ text: line, style, timestamp: Date.now() }));
    setState((prev) => ({
      ...prev,
      narrative: [...prev.narrative.slice(-(MAX_NARRATIVE - entries.length)), ...entries],
    }));
  }, []);

  useEffect(() => {
    const unsubscribe = client.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "welcome":
          setState((prev) => ({
            ...prev,
            connected: true,
            sessionId: msg.sessionId,
            serverName: msg.serverName,
          }));
          addNarrative(`Connected to ${msg.serverName}`, "system");
          break;

        case "room_state":
          setState((prev) => ({ ...prev, room: msg.room }));
          break;

        case "narrative":
          addNarrative(msg.text, msg.style ?? "info");
          break;

        case "combat_start":
          setState((prev) => ({
            ...prev,
            combat: {
              active: true,
              combatants: msg.combatants,
              targetId: msg.combatants[0]?.id ?? "",
            },
          }));
          addNarrative(`Combat begins! ${msg.target} attacks!`, "combat");
          break;

        case "combat_update":
          setState((prev) => ({
            ...prev,
            combat: prev.combat ? {
              ...prev.combat,
              combatants: msg.combatants,
              targetId: msg.targetId,
            } : {
              active: true,
              combatants: msg.combatants,
              targetId: msg.targetId,
            },
          }));
          break;

        case "combat_end":
          setState((prev) => ({ ...prev, combat: null }));
          addNarrative(
            msg.reason === "victory" ? "Combat ends — victory!" :
            msg.reason === "flee" ? "You escaped from combat." :
            "You have been defeated.",
            "combat"
          );
          break;

        case "character_update":
          setState((prev) => ({
            ...prev,
            stats: {
              hp: msg.hp,
              maxHp: msg.maxHp,
              mp: msg.mp,
              maxMp: msg.maxMp,
              ap: msg.ap,
              maxAp: msg.maxAp,
              gold: msg.gold,
              level: msg.level,
              xp: msg.xp,
              xpToNext: msg.xpToNext,
            },
          }));
          break;

        case "map_update":
          setState((prev) => ({
            ...prev,
            map: { grid: msg.grid, cursorRow: msg.cursorRow, cursorCol: msg.cursorCol, legend: msg.legend },
          }));
          break;

        case "level_up":
          addNarrative(`Level up! You are now level ${msg.level}!`, "system");
          break;

        case "entity_enter":
          addNarrative(`${msg.entity.name} has arrived.`, "system");
          break;

        case "entity_leave":
          addNarrative(
            `${msg.entity.name} left${msg.direction ? ` to the ${msg.direction}` : ""}.`,
            "system"
          );
          break;

        case "chat":
          if (msg.channel === "whisper") {
            addNarrative(`${msg.sender} whispers: ${msg.message}`, "chat");
          } else if (msg.channel === "shout") {
            addNarrative(`${msg.sender} shouts: ${msg.message}`, "chat");
          } else {
            addNarrative(`${msg.sender} says: ${msg.message}`, "chat");
          }
          break;

        case "inventory_update":
          setState((prev) => ({ ...prev, inventory: msg.inventory }));
          break;

        case "equipment_update":
          setState((prev) => ({ ...prev, equipment: msg.equipment }));
          break;

        case "error":
          if (msg.code === "DISCONNECTED") {
            setState((prev) => ({ ...prev, connected: false }));
            addNarrative("Disconnected from server.", "error");
          } else {
            addNarrative(`[${msg.code}] ${msg.message}`, "error");
          }
          break;

        case "pong":
        case "ack":
          break;
      }
    });

    return unsubscribe;
  }, [client, addNarrative]);

  return state;
}
