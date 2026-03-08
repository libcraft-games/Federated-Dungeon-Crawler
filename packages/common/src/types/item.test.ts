import { describe, expect, test } from "bun:test";
import { createItemInstance, generateItemId } from "./item.js";
import type { ItemDefinition } from "@realms/lexicons";

describe("generateItemId", () => {
  test("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateItemId());
    }
    expect(ids.size).toBe(100);
  });

  test("starts with item_ prefix", () => {
    expect(generateItemId()).toMatch(/^item_/);
  });
});

describe("createItemInstance", () => {
  const sword: ItemDefinition = {
    name: "Iron Sword",
    type: "weapon",
    description: "A basic sword.",
    weight: 3,
    value: 10,
  };

  const potion: ItemDefinition = {
    name: "Health Potion",
    type: "consumable",
    description: "Heals wounds.",
    stackable: true,
    maxStack: 10,
  };

  test("creates instance with correct fields", () => {
    const item = createItemInstance("starter:iron-sword", sword);
    expect(item.definitionId).toBe("starter:iron-sword");
    expect(item.name).toBe("Iron Sword");
    expect(item.quantity).toBe(1);
    expect(item.instanceId).toMatch(/^item_/);
  });

  test("respects quantity", () => {
    const item = createItemInstance("starter:potion", potion, 5);
    expect(item.quantity).toBe(5);
  });

  test("caps quantity at maxStack for stackable items", () => {
    const item = createItemInstance("starter:potion", potion, 50);
    expect(item.quantity).toBe(10);
  });

  test("non-stackable items default to quantity 1", () => {
    const item = createItemInstance("starter:iron-sword", sword, 5);
    expect(item.quantity).toBe(1);
  });

  test("copies properties from definition", () => {
    const def: ItemDefinition = {
      name: "Magic Ring",
      type: "accessory",
      description: "Shiny.",
      properties: { bonus_hp: 5, slot: "ring" },
    };
    const item = createItemInstance("test:ring", def);
    expect(item.properties).toEqual({ bonus_hp: 5, slot: "ring" });
  });
});
