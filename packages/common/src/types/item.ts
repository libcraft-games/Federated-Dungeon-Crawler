import type { ItemDefinition, ItemProperties } from "@realms/lexicons";

/** An item instance in a player's inventory or on the ground */
export interface ItemInstance {
  instanceId: string;
  definitionId: string;
  name: string;
  quantity: number;
  properties?: ItemProperties;
}

/** A collection of item definitions keyed by definition ID */
export type ItemRegistry = Map<string, ItemDefinition>;

/** Generate a unique item instance ID */
export function generateItemId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create an item instance from a definition */
export function createItemInstance(
  definitionId: string,
  definition: ItemDefinition,
  quantity: number = 1
): ItemInstance {
  return {
    instanceId: generateItemId(),
    definitionId,
    name: definition.name,
    quantity: Math.min(quantity, definition.maxStack ?? (definition.stackable ? 99 : 1)),
    properties: definition.properties ? { ...definition.properties } : undefined,
  };
}
