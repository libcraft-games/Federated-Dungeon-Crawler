import type { ParsedCommand } from "@realms/common";
import { getEquipSlot, getEquippedDefense, getWeaponDamage } from "@realms/common";
import { encodeMessage } from "@realms/protocol";
import type { CommandContext } from "./index.js";
import { sendNarrative } from "./index.js";

export function handleEquipment(cmd: ParsedCommand, ctx: CommandContext): void {
  switch (cmd.verb) {
    case "equip":
    case "wear":
    case "wield":
      handleEquip(cmd, ctx);
      break;
    case "unequip":
    case "remove":
      handleUnequip(cmd, ctx);
      break;
    case "equipment":
      showEquipment(ctx);
      break;
  }
}

function handleEquip(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session, world } = ctx;
  const itemName = cmd.args.join(" ");

  if (!itemName) {
    sendNarrative(session, "Equip what? Specify an item from your inventory.", "error");
    return;
  }

  // Find item in inventory
  const item = session.findItem(itemName);
  if (!item) {
    sendNarrative(session, `You don't have '${itemName}'.`, "error");
    return;
  }

  // Look up definition to determine slot
  const def = world.areaManager.getItemDefinition(item.definitionId);
  if (!def) {
    sendNarrative(session, `${item.name} doesn't seem equippable.`, "error");
    return;
  }

  const slot = getEquipSlot(def.type, def.properties, def.tags);
  if (!slot) {
    sendNarrative(session, `${item.name} is not equippable.`, "error");
    return;
  }

  // Check level requirement
  if (def.levelRequired && session.state.level < def.levelRequired) {
    sendNarrative(session, `You need to be level ${def.levelRequired} to equip ${item.name}.`, "error");
    return;
  }

  // Remove from inventory (take 1)
  const removed = session.removeItem(itemName, 1);
  if (!removed) {
    sendNarrative(session, `Failed to equip ${item.name}.`, "error");
    return;
  }

  // Unequip existing item in that slot
  const previous = session.unequip(slot);
  if (previous) {
    session.addItem(previous);
    sendNarrative(session, `You unequip ${previous.name}.`, "info");
  }

  // Equip the new item
  session.equip(slot, { ...removed, quantity: 1 });

  const slotNames: Record<string, string> = {
    mainHand: "main hand",
    offHand: "off hand",
    head: "head",
    body: "body",
    feet: "feet",
    ring: "ring",
  };

  sendNarrative(session, `You equip ${removed.name} (${slotNames[slot] ?? slot}).`, "info");
  sendUpdates(ctx);
}

function handleUnequip(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session } = ctx;
  const slotOrName = cmd.args.join(" ");

  if (!slotOrName) {
    sendNarrative(session, "Unequip what? Specify an item or slot.", "error");
    return;
  }

  const lower = slotOrName.toLowerCase();

  // Try as slot name first
  const slotAliases: Record<string, string> = {
    "main hand": "mainHand",
    "mainhand": "mainHand",
    "weapon": "mainHand",
    "off hand": "offHand",
    "offhand": "offHand",
    "shield": "offHand",
    "head": "head",
    "helmet": "head",
    "body": "body",
    "armor": "body",
    "chest": "body",
    "feet": "feet",
    "boots": "feet",
    "ring": "ring",
  };

  let slot = slotAliases[lower];

  // If not a slot alias, search equipment by item name
  if (!slot) {
    for (const [s, item] of Object.entries(session.equipment)) {
      if (item.name.toLowerCase().includes(lower)) {
        slot = s;
        break;
      }
    }
  }

  if (!slot) {
    sendNarrative(session, `You don't have '${slotOrName}' equipped.`, "error");
    return;
  }

  const item = session.unequip(slot);
  if (!item) {
    sendNarrative(session, `Nothing equipped in that slot.`, "error");
    return;
  }

  session.addItem(item);
  sendNarrative(session, `You unequip ${item.name}.`, "info");
  sendUpdates(ctx);
}

function showEquipment(ctx: CommandContext): void {
  const { session } = ctx;
  const eq = session.equipment;

  const slots = [
    { key: "mainHand", label: "Main Hand" },
    { key: "offHand", label: "Off Hand" },
    { key: "head", label: "Head" },
    { key: "body", label: "Body" },
    { key: "feet", label: "Feet" },
    { key: "ring", label: "Ring" },
  ];

  const lines = ["Equipment:"];
  for (const { key, label } of slots) {
    const item = eq[key];
    if (item) {
      const props: string[] = [];
      if (item.properties?.damage) props.push(`damage: ${item.properties.damage}`);
      if (item.properties?.defense) props.push(`defense: ${item.properties.defense}`);
      const propStr = props.length > 0 ? ` (${props.join(", ")})` : "";
      lines.push(`  ${label}: ${item.name}${propStr}`);
    } else {
      lines.push(`  ${label}: —`);
    }
  }

  // Also show equipped slots not in the standard list
  for (const [key, item] of Object.entries(eq)) {
    if (!slots.some((s) => s.key === key)) {
      lines.push(`  ${key}: ${item.name}`);
    }
  }

  // Summary
  const totalDefense = getEquippedDefense(eq);
  const weaponDmg = getWeaponDamage(eq);
  lines.push("");
  lines.push(`Weapon damage: ${weaponDmg} | Armor defense: ${totalDefense}`);

  sendNarrative(session, lines.join("\n"), "info");
}

function sendUpdates(ctx: CommandContext): void {
  ctx.session.send(
    encodeMessage({ type: "inventory_update", inventory: ctx.session.inventory })
  );
}
