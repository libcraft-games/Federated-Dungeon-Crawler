import { useState, useEffect, useCallback, useRef } from "react";
import type { ServerMessage } from "@realms/protocol";
import type { RoomState, ItemInstance } from "@realms/common";
import type { WsClient } from "../connection/ws-client.js";

export interface NarrativeLine {
  text: string;
  style: "info" | "error" | "combat" | "system" | "chat";
  timestamp: number;
}

export interface GameState {
  connected: boolean;
  sessionId: string | null;
  serverName: string | null;
  room: RoomState | null;
  inventory: ItemInstance[];
  narrative: NarrativeLine[];
}

const MAX_NARRATIVE = 200;

export function useGameState(client: WsClient) {
  const [state, setState] = useState<GameState>({
    connected: false,
    sessionId: null,
    serverName: null,
    room: null,
    inventory: [],
    narrative: [],
  });

  const addNarrative = useCallback((text: string, style: NarrativeLine["style"] = "info") => {
    setState((prev) => ({
      ...prev,
      narrative: [...prev.narrative.slice(-(MAX_NARRATIVE - 1)), { text, style, timestamp: Date.now() }],
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

        case "error":
          if (msg.code === "DISCONNECTED") {
            setState((prev) => ({ ...prev, connected: false }));
            addNarrative("Disconnected from server.", "error");
          } else {
            addNarrative(`[${msg.code}] ${msg.message}`, "error");
          }
          break;

        case "pong":
          break;

        case "ack":
          break;
      }
    });

    return unsubscribe;
  }, [client, addNarrative]);

  return state;
}
