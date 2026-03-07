import type { RoomRecord, Direction, RoomExit } from "@realms/lexicons";
import type { RoomState, EntityBrief, ItemBrief } from "@realms/common";
import { findExit, hasFlag } from "@realms/common";

export class Room {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly area: string;
  readonly coordinates: { x: number; y: number; z: number };
  readonly exits: RoomExit[];
  readonly flags: string[];

  private players = new Map<string, EntityBrief>();
  private npcs = new Map<string, EntityBrief>();
  private items: ItemBrief[] = [];

  constructor(id: string, record: RoomRecord) {
    this.id = id;
    this.title = record.title;
    this.description = record.description;
    this.area = record.area;
    this.coordinates = record.coordinates;
    this.exits = record.exits ?? [];
    this.flags = record.flags ?? [];
  }

  addPlayer(id: string, name: string): void {
    this.players.set(id, { id, name, type: "player" });
  }

  removePlayer(id: string): EntityBrief | undefined {
    const player = this.players.get(id);
    this.players.delete(id);
    return player;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  getPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  getExit(direction: Direction): RoomExit | undefined {
    return findExit(this.toState(), direction);
  }

  isSafe(): boolean {
    return hasFlag(this.toState(), "safe");
  }

  toState(): RoomState {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      area: this.area,
      coordinates: this.coordinates,
      exits: this.exits,
      flags: this.flags,
      players: [...this.players.values()],
      npcs: [...this.npcs.values()],
      items: [...this.items],
    };
  }
}
