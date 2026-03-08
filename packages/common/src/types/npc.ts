import type { NpcDefinition, NpcBehavior, Attributes } from "@realms/lexicons";

export type NpcState = "idle" | "wandering" | "conversing" | "combat" | "fleeing" | "dead";

export interface NpcInstance {
  instanceId: string;
  definitionId: string;
  name: string;
  behavior: NpcBehavior;
  state: NpcState;
  level: number;
  currentRoom: string;
  attributes?: Attributes;
}

export function generateNpcId(): string {
  return `npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createNpcInstance(
  definitionId: string,
  definition: NpcDefinition,
  roomId: string
): NpcInstance {
  return {
    instanceId: generateNpcId(),
    definitionId,
    name: definition.name,
    behavior: definition.behavior,
    state: "idle",
    level: definition.level ?? 1,
    currentRoom: roomId,
    attributes: definition.attributes ? { ...definition.attributes } : undefined,
  };
}
