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
  currentHp: number;
  maxHp: number;
}

/** Compute NPC max HP from level and constitution */
export function computeNpcMaxHp(level: number, attributes?: Attributes): number {
  const con = attributes?.con ?? 10;
  return 10 + level * 5 + Math.max(0, Math.floor((con - 10) / 2));
}

export function generateNpcId(): string {
  return `npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createNpcInstance(
  definitionId: string,
  definition: NpcDefinition,
  roomId: string
): NpcInstance {
  const level = definition.level ?? 1;
  const maxHp = computeNpcMaxHp(level, definition.attributes);

  return {
    instanceId: generateNpcId(),
    definitionId,
    name: definition.name,
    behavior: definition.behavior,
    state: "idle",
    level,
    currentRoom: roomId,
    attributes: definition.attributes ? { ...definition.attributes } : undefined,
    currentHp: maxHp,
    maxHp,
  };
}
