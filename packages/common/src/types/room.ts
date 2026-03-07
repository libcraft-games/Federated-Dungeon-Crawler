import type { RoomRecord, Direction, RoomExit } from "@realms/lexicons";

export interface RoomState {
  id: string;
  title: string;
  description: string;
  area: string;
  coordinates: { x: number; y: number; z: number };
  exits: RoomExit[];
  flags: string[];
  players: EntityBrief[];
  npcs: EntityBrief[];
  items: ItemBrief[];
}

export interface EntityBrief {
  id: string;
  name: string;
  type: "player" | "npc";
}

export interface ItemBrief {
  id: string;
  name: string;
  quantity: number;
}

export function roomRecordToState(id: string, record: RoomRecord): RoomState {
  return {
    id,
    title: record.title,
    description: record.description,
    area: record.area,
    coordinates: record.coordinates,
    exits: record.exits ?? [],
    flags: record.flags ?? [],
    players: [],
    npcs: [],
    items: [],
  };
}

export function findExit(room: RoomState, direction: Direction): RoomExit | undefined {
  return room.exits.find((e) => e.direction === direction);
}

export function hasFlag(room: RoomState, flag: string): boolean {
  return room.flags.includes(flag);
}
