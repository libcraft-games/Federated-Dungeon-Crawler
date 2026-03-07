import type { CharacterProfile, StatBlock, CharacterClass, CharacterRace } from "@realms/lexicons";

export interface CharacterState extends CharacterProfile {
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  currentAp: number;
  maxAp: number;
  currentRoom: string;
  activeEffects: ActiveEffect[];
}

export interface ActiveEffect {
  id: string;
  name: string;
  type: "buff" | "debuff";
  stat?: string;
  magnitude: number;
  remainingTicks: number;
}

export function calculateMaxHp(level: number, constitution: number): number {
  return 20 + (level - 1) * 8 + Math.floor(constitution / 2);
}

export function calculateMaxMp(level: number, intelligence: number, charClass: CharacterClass): number {
  const baseMp: Record<CharacterClass, number> = {
    mage: 30,
    cleric: 20,
    ranger: 10,
    rogue: 5,
    warrior: 5,
  };
  return baseMp[charClass] + (level - 1) * 4 + Math.floor(intelligence / 3);
}

export function calculateMaxAp(dexterity: number): number {
  return 4 + Math.floor((dexterity - 10) / 4);
}

export function createDefaultStats(charClass: CharacterClass, race: CharacterRace): StatBlock {
  const base: StatBlock = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };

  // Class bonuses
  const classBonus: Record<CharacterClass, Partial<StatBlock>> = {
    warrior: { strength: 4, constitution: 2 },
    mage: { intelligence: 4, wisdom: 2 },
    rogue: { dexterity: 4, charisma: 2 },
    cleric: { wisdom: 4, constitution: 2 },
    ranger: { dexterity: 2, wisdom: 2, constitution: 2 },
  };

  // Race bonuses
  const raceBonus: Record<CharacterRace, Partial<StatBlock>> = {
    human: { charisma: 2, constitution: 1, strength: 1 },
    elf: { dexterity: 2, intelligence: 2 },
    dwarf: { constitution: 3, strength: 1 },
    halfling: { dexterity: 3, charisma: 1 },
    orc: { strength: 3, constitution: 1 },
  };

  for (const [stat, bonus] of Object.entries(classBonus[charClass])) {
    base[stat as keyof StatBlock] += bonus!;
  }
  for (const [stat, bonus] of Object.entries(raceBonus[race])) {
    base[stat as keyof StatBlock] += bonus!;
  }

  return base;
}

export function profileToState(profile: CharacterProfile, currentRoom: string): CharacterState {
  const maxHp = calculateMaxHp(profile.level, profile.stats.constitution);
  const maxMp = calculateMaxMp(profile.level, profile.stats.intelligence, profile.class);
  const maxAp = calculateMaxAp(profile.stats.dexterity);

  return {
    ...profile,
    currentHp: maxHp,
    maxHp,
    currentMp: maxMp,
    maxMp,
    currentAp: maxAp,
    maxAp,
    currentRoom,
    activeEffects: [],
  };
}
