import type { NpcDefinition } from "@realms/lexicons";
import type { NpcInstance } from "@realms/common";
import { createNpcInstance } from "@realms/common";
import type { Room } from "../world/room.js";

export class NpcManager {
  private definitions = new Map<string, NpcDefinition>();
  private instances = new Map<string, NpcInstance>();

  registerDefinition(id: string, def: NpcDefinition): void {
    this.definitions.set(id, def);
  }

  getDefinition(id: string): NpcDefinition | undefined {
    return this.definitions.get(id);
  }

  spawnNpc(definitionId: string, room: Room): NpcInstance | undefined {
    const def = this.definitions.get(definitionId);
    if (!def) return undefined;

    const instance = createNpcInstance(definitionId, def, room.id);
    this.instances.set(instance.instanceId, instance);

    // Add to room's NPC list
    room.addNpc(instance.instanceId, instance.name);

    return instance;
  }

  getInstance(instanceId: string): NpcInstance | undefined {
    return this.instances.get(instanceId);
  }

  /** Find an NPC instance by name in a specific room */
  findInRoom(roomId: string, name: string): NpcInstance | undefined {
    const lower = name.toLowerCase();
    for (const npc of this.instances.values()) {
      if (npc.currentRoom === roomId && npc.name.toLowerCase().includes(lower)) {
        return npc;
      }
    }
    return undefined;
  }

  getAllInRoom(roomId: string): NpcInstance[] {
    const result: NpcInstance[] = [];
    for (const npc of this.instances.values()) {
      if (npc.currentRoom === roomId) {
        result.push(npc);
      }
    }
    return result;
  }

  get definitionCount(): number {
    return this.definitions.size;
  }

  get instanceCount(): number {
    return this.instances.size;
  }
}
