import { AreaManager } from "./area-manager.js";
import { loadGameSystem } from "./system-loader.js";
import { Room } from "./room.js";
import type { GameSystem } from "@realms/common";
import type { ServerConfig } from "../config.js";
import { NpcManager } from "../entities/npc-manager.js";

export class WorldManager {
  readonly areaManager: AreaManager;
  readonly npcManager: NpcManager;
  gameSystem!: GameSystem;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.npcManager = new NpcManager();
    this.areaManager = new AreaManager(this.npcManager);
  }

  async initialize(): Promise<void> {
    // Load game system first (attributes, classes, races, formulas)
    this.gameSystem = await loadGameSystem(this.config.dataPath);

    // Load world areas/rooms
    const areasPath = `${this.config.dataPath}/areas`;
    await this.areaManager.loadFromDirectory(areasPath);

    const totalRooms = this.areaManager.getAllRooms().size;
    console.log(`World loaded: ${totalRooms} rooms total`);

    // Validate default spawn room exists
    const spawnRoom = this.getRoom(this.config.defaultSpawnRoom);
    if (!spawnRoom) {
      throw new Error(`Default spawn room not found: ${this.config.defaultSpawnRoom}`);
    }
  }

  getRoom(id: string): Room | undefined {
    return this.areaManager.getRoom(id);
  }

  getDefaultSpawnRoom(): string {
    return this.config.defaultSpawnRoom;
  }
}
