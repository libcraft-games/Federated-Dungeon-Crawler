import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { RoomRecord, AreaRecord, ItemDefinition, NpcDefinition, NpcBehavior, DialogueNode, DialogueResponse } from "@realms/lexicons";
import { Room } from "./room.js";
import { createItemInstance, type ItemRegistry } from "@realms/common";
import { NpcManager } from "../entities/npc-manager.js";

interface AreaManifest {
  id: string;
  title: string;
  description: string;
  levelRange?: { min: number; max: number };
}

interface RoomDef {
  id: string;
  title: string;
  description: string;
  coordinates: { x: number; y: number; z: number };
  exits?: Array<{
    direction: string;
    target: string;
    portal?: boolean;
    requiredLevel?: number;
    description?: string;
  }>;
  flags?: string[];
}

interface ItemDef {
  id: string;
  name: string;
  type: string;
  description: string;
  weight?: number;
  value?: number;
  rarity?: string;
  levelRequired?: number;
  stackable?: boolean;
  maxStack?: number;
  properties?: Record<string, unknown>;
  tags?: string[];
}

interface ItemSpawn {
  room: string;
  items: Array<{ id: string; quantity: number }>;
}

interface ItemsFile {
  definitions: ItemDef[];
  spawns?: ItemSpawn[];
}

interface NpcDef {
  id: string;
  name: string;
  description: string;
  behavior: string;
  level?: number;
  attributes?: Record<string, number>;
  dialogue?: Record<string, { text: string; responses?: Array<{ text: string; next?: string }> }>;
  tags?: string[];
}

interface NpcSpawn {
  room: string;
  npcs: Array<{ id: string }>;
}

interface NpcsFile {
  definitions: NpcDef[];
  spawns?: NpcSpawn[];
}

export class AreaManager {
  private rooms = new Map<string, Room>();
  private areas = new Map<string, AreaManifest>();
  private itemDefinitions: ItemRegistry = new Map();
  private npcManager: NpcManager;

  constructor(npcManager: NpcManager) {
    this.npcManager = npcManager;
  }

  async loadFromDirectory(basePath: string): Promise<void> {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const areaPath = join(basePath, entry.name);
      await this.loadArea(entry.name, areaPath);
    }
  }

  private async loadArea(areaId: string, areaPath: string): Promise<void> {
    // Load manifest
    const manifestFile = Bun.file(join(areaPath, "manifest.yml"));
    if (!(await manifestFile.exists())) {
      console.warn(`No manifest.yml found in area: ${areaId}`);
      return;
    }

    const manifestText = await manifestFile.text();
    const manifest: AreaManifest = { id: areaId, ...parseYaml(manifestText) };
    this.areas.set(areaId, manifest);

    // Load rooms
    const roomsFile = Bun.file(join(areaPath, "rooms.yml"));
    if (await roomsFile.exists()) {
      const roomsText = await roomsFile.text();
      const roomDefs: RoomDef[] = parseYaml(roomsText);

      for (const def of roomDefs) {
        const roomId = `${areaId}:${def.id}`;
        const record: RoomRecord = {
          title: def.title,
          description: def.description,
          area: areaId,
          coordinates: def.coordinates,
          exits: def.exits?.map((e) => ({
            direction: e.direction as any,
            target: e.target.includes(":") ? e.target : `${areaId}:${e.target}`,
            portal: e.portal,
            requiredLevel: e.requiredLevel,
            description: e.description,
          })),
          flags: def.flags,
        };
        this.rooms.set(roomId, new Room(roomId, record));
      }
    }

    // Load items
    const itemsFile = Bun.file(join(areaPath, "items.yml"));
    if (await itemsFile.exists()) {
      const itemsText = await itemsFile.text();
      const itemsData: ItemsFile = parseYaml(itemsText);
      let itemCount = 0;

      // Register definitions
      for (const def of itemsData.definitions) {
        const defId = `${areaId}:${def.id}`;
        const itemDef: ItemDefinition = {
          name: def.name,
          type: def.type,
          description: def.description,
          weight: def.weight,
          value: def.value,
          rarity: def.rarity,
          levelRequired: def.levelRequired,
          stackable: def.stackable,
          maxStack: def.maxStack,
          properties: def.properties,
          tags: def.tags,
        };
        this.itemDefinitions.set(defId, itemDef);
        itemCount++;
      }

      // Spawn items into rooms
      if (itemsData.spawns) {
        for (const spawn of itemsData.spawns) {
          const roomId = `${areaId}:${spawn.room}`;
          const room = this.rooms.get(roomId);
          if (!room) {
            console.warn(`Item spawn references unknown room: ${roomId}`);
            continue;
          }
          for (const item of spawn.items) {
            const defId = `${areaId}:${item.id}`;
            const def = this.itemDefinitions.get(defId);
            if (!def) {
              console.warn(`Item spawn references unknown item: ${defId}`);
              continue;
            }
            const instance = createItemInstance(defId, def, item.quantity);
            room.addGroundItem(instance);
          }
        }
      }

      console.log(`  Items: ${itemCount} definitions loaded`);
    }

    // Load NPCs
    const npcsFile = Bun.file(join(areaPath, "npcs.yml"));
    if (await npcsFile.exists()) {
      const npcsText = await npcsFile.text();
      const npcsData: NpcsFile = parseYaml(npcsText);
      let npcCount = 0;

      // Register definitions
      for (const def of npcsData.definitions) {
        const defId = `${areaId}:${def.id}`;
        const npcDef: NpcDefinition = {
          name: def.name,
          description: def.description,
          behavior: def.behavior as NpcBehavior,
          level: def.level,
          attributes: def.attributes,
          dialogue: def.dialogue as NpcDefinition["dialogue"],
          tags: def.tags,
        };
        this.npcManager.registerDefinition(defId, npcDef);
        npcCount++;
      }

      // Spawn NPCs into rooms
      if (npcsData.spawns) {
        for (const spawn of npcsData.spawns) {
          const roomId = `${areaId}:${spawn.room}`;
          const room = this.rooms.get(roomId);
          if (!room) {
            console.warn(`NPC spawn references unknown room: ${roomId}`);
            continue;
          }
          for (const npc of spawn.npcs) {
            const defId = `${areaId}:${npc.id}`;
            this.npcManager.spawnNpc(defId, room);
          }
        }
      }

      console.log(`  NPCs: ${npcCount} definitions loaded`);
    }

    console.log(`Loaded area: ${manifest.title} (${this.getRoomCountForArea(areaId)} rooms)`);
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getAllRooms(): Map<string, Room> {
    return this.rooms;
  }

  getArea(id: string): AreaManifest | undefined {
    return this.areas.get(id);
  }

  getItemDefinition(id: string): ItemDefinition | undefined {
    return this.itemDefinitions.get(id);
  }

  getAllItemDefinitions(): ItemRegistry {
    return this.itemDefinitions;
  }

  private getRoomCountForArea(areaId: string): number {
    let count = 0;
    for (const key of this.rooms.keys()) {
      if (key.startsWith(`${areaId}:`)) count++;
    }
    return count;
  }
}
