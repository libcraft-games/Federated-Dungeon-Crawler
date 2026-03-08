import type { Attributes, ItemProperties, ItemTypeDef, EquipSlotDef } from "@realms/lexicons";
import type { ItemInstance } from "../types/item.js";

/** Subset of GameSystem needed for equipment resolution */
export interface EquipmentConfig {
  equipSlots: Record<string, EquipSlotDef>;
  itemTypes: Record<string, ItemTypeDef>;
}

// ── Dice ──

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

// ── Attribute Modifiers ──

export function attrMod(value: number): number {
  return Math.floor((value - 10) / 2);
}

function getAttr(attrs: Attributes | undefined, key: string, fallback: number = 10): number {
  return attrs?.[key] ?? fallback;
}

// ── Equipment Helpers ──

/**
 * Resolve the equip slot for an item, driven by server's system config.
 *
 * Priority:
 * 1. Explicit `properties.slot` if it's a valid slot ID
 * 2. Tag matching — if a tag matches a slot ID in the config
 * 3. Item type's `defaultSlot`
 * 4. null (not equippable)
 */
export function getEquipSlot(
  config: EquipmentConfig,
  type: string,
  properties?: ItemProperties,
  tags?: string[]
): string | null {
  const typeDef = config.itemTypes[type];

  // Not equippable if the type isn't registered or isn't marked equippable
  if (!typeDef?.equippable) return null;

  // Priority 1: Explicit slot in properties
  if (properties?.slot && typeof properties.slot === "string") {
    if (config.equipSlots[properties.slot]) return properties.slot;
  }

  // Priority 2: Tag matches a slot ID (e.g., tag "head" matches slot "head")
  if (tags) {
    const validSlots = typeDef.equipSlots;
    for (const tag of tags) {
      if (config.equipSlots[tag]) {
        // If the item type restricts which slots it can go in, enforce that
        if (!validSlots || validSlots.includes(tag)) return tag;
      }
    }
  }

  // Priority 3: Item type's default slot
  if (typeDef.defaultSlot && config.equipSlots[typeDef.defaultSlot]) {
    return typeDef.defaultSlot;
  }

  return null;
}

/**
 * Build a map of alias -> slot ID from the equip slot config.
 * Includes the slot ID itself and its name (lowercased) as aliases.
 */
export function buildSlotAliases(config: EquipmentConfig): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [slotId, def] of Object.entries(config.equipSlots)) {
    aliases[slotId.toLowerCase()] = slotId;
    aliases[def.name.toLowerCase()] = slotId;
    if (def.aliases) {
      for (const alias of def.aliases) {
        aliases[alias.toLowerCase()] = slotId;
      }
    }
  }
  return aliases;
}

export function getEquippedDefense(equipment: Record<string, ItemInstance>): number {
  let total = 0;
  for (const item of Object.values(equipment)) {
    const defense = item.properties?.defense;
    if (typeof defense === "number") total += defense;
  }
  return total;
}

export function getWeaponDamage(equipment: Record<string, ItemInstance>): number {
  // This will have to handle dual wielding and two-handed weapons eventually, but for now we assume a single main hand weapon or unarmed.
  const weapon = equipment.mainHand;
  if (weapon?.properties?.damage && typeof weapon.properties.damage === "number") {
    return weapon.properties.damage;
  }
  return 1; // unarmed
}

export function getWeaponName(equipment: Record<string, ItemInstance>): string {
  // Might be fun for races with natural weapons to have a different unarmed attack name, but for now we just return "fists" if no weapon equipped.
  return equipment.mainHand?.name ?? "fists";
}

export function getWeaponSpeed(equipment: Record<string, ItemInstance>): string {
  const speed = equipment.mainHand?.properties?.speed;
  return typeof speed === "string" ? speed : "medium";
}

// ── Attack Resolution ──

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  roll: number;
  attackBonus: number;
  totalAttack: number;
  defense: number;
  damage: number;
  weaponName: string;
}

export function resolvePlayerAttack(
  playerAttrs: Attributes,
  playerEquipment: Record<string, ItemInstance>,
  npcAttrs: Attributes | undefined,
  npcLevel: number
): AttackResult {
  const roll = rollD20();
  const critical = roll === 20;

  // Attack bonus: use higher of str/dex modifier (finesse-style)
  // In the future we could have weapon-specific bonuses 
  // (e.g. bows use dex, heavy weapons use str, maybe even some weapons using other attributes),
  // but for now we just take the best of both.
  const strMod = attrMod(getAttr(playerAttrs, "str"));
  const dexMod = attrMod(getAttr(playerAttrs, "dex"));
  const attackBonus = Math.max(strMod, dexMod);
  const totalAttack = roll + attackBonus;

  // NPC defense: 10 + dex modifier
  // We could also factor in armor or other defenses here, but for now we keep it simple.
  const npcDexMod = attrMod(getAttr(npcAttrs, "dex"));
  const defense = 10 + npcDexMod;

  const hit = critical || totalAttack >= defense;

  // Damage: weapon damage + best modifier (min 1)
  let damage = 0;
  if (hit) {
    const weaponDmg = getWeaponDamage(playerEquipment);
    damage = Math.max(1, weaponDmg + attackBonus);
    if (critical) damage *= 2;
  }

  return {
    hit,
    critical,
    roll,
    attackBonus,
    totalAttack,
    defense,
    damage,
    weaponName: getWeaponName(playerEquipment),
  };
}

/** Calculate NPC attack against a player */
export function resolveNpcAttack(
  npcAttrs: Attributes | undefined,
  npcLevel: number,
  npcName: string,
  playerAttrs: Attributes,
  playerEquipment: Record<string, ItemInstance>
): AttackResult {
  const roll = rollD20();
  const critical = roll === 20;

  // NPC attack bonus: dex modifier + level bonus
  // For simplicity, we use dex for NPC attack bonus, but we could also have some NPCs use str or other attributes depending on their type.
  const npcDexMod = attrMod(getAttr(npcAttrs, "dex"));
  const attackBonus = npcDexMod + Math.floor(npcLevel / 2);
  const totalAttack = roll + attackBonus;

  // Player defense: 10 + dex modifier + armor
  const playerDexMod = attrMod(getAttr(playerAttrs, "dex"));
  const armorDefense = getEquippedDefense(playerEquipment);
  const defense = 10 + playerDexMod + armorDefense;

  const hit = critical || totalAttack >= defense;

  // NPC damage: level-based + str modifier
  let damage = 0;
  if (hit) {
    const npcStrMod = attrMod(getAttr(npcAttrs, "str"));
    const baseDamage = npcLevel * 2 + npcStrMod;
    damage = Math.max(1, baseDamage);
    if (critical) damage *= 2;
  }

  return {
    hit,
    critical,
    roll,
    attackBonus,
    totalAttack,
    defense,
    damage,
    weaponName: npcName, // NPC's "weapon" is itself
  };
}

// ── XP and Leveling ──

/** Calculate XP reward for defeating an NPC */
export function calculateXpReward(npcLevel: number, playerLevel: number): number {
  const baseXp = npcLevel * 15;
  const levelDiff = npcLevel - playerLevel;

  let modifier = 1.0;
  if (levelDiff > 0) {
    modifier = 1.0 + levelDiff * 0.1; // +10% per level above
  } else if (levelDiff < 0) {
    modifier = Math.max(0.1, 1.0 + levelDiff * 0.2); // -20% per level below, min 10%
  }

  return Math.max(1, Math.floor(baseXp * modifier));
}

/** XP needed to reach a given level (total cumulative) */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return level * (level - 1) * 50;
}

/** XP needed from current level to next level */
export function xpToNextLevel(currentLevel: number, currentXp: number): number {
  return Math.max(0, xpForLevel(currentLevel + 1) - currentXp);
}

/** Check if player should level up, returns new level */
export function checkLevelUp(currentLevel: number, totalXp: number): number {
  let level = currentLevel;
  while (totalXp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

// ── Flee Check ──

/** Attempt to flee combat. Returns true if successful. */
export function attemptFlee(playerDex: number, npcLevel: number): boolean {
  const roll = rollD20();
  const dexMod = attrMod(playerDex);
  const target = 10 + npcLevel;
  return roll + dexMod >= target;
}

// ── Combat Narrative Formatting ──

export function formatAttackResult(
  attackerName: string,
  targetName: string,
  result: AttackResult,
  targetHp: number,
  targetMaxHp: number
): string {
  const lines: string[] = [];

  if (result.critical) {
    lines.push(`${attackerName} lands a CRITICAL HIT on ${targetName} with ${result.weaponName}!`);
  } else if (result.hit) {
    lines.push(`${attackerName} attacks ${targetName} with ${result.weaponName}.`);
  } else {
    lines.push(`${attackerName} swings at ${targetName} with ${result.weaponName} but misses!`);
  }

  lines.push(
    `  Roll: ${result.roll} + ${result.attackBonus} = ${result.totalAttack} vs AC ${result.defense} — ${result.hit ? "Hit!" : "Miss!"}`
  );

  if (result.hit) {
    lines.push(`  ${result.damage} damage dealt. ${targetName} HP: ${targetHp}/${targetMaxHp}`);
  }

  return lines.join("\n");
}
