import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { RoomRecord, AreaRecord } from "@realms/lexicons";
import { Room } from "./room.js";

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

export class AreaManager {
  private rooms = new Map<string, Room>();
  private areas = new Map<string, AreaManifest>();

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

  private getRoomCountForArea(areaId: string): number {
    let count = 0;
    for (const key of this.rooms.keys()) {
      if (key.startsWith(`${areaId}:`)) count++;
    }
    return count;
  }
}
