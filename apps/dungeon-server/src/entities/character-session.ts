import type { CharacterProfile, FormulaDef } from "@realms/lexicons";
import type { CharacterState, ItemInstance } from "@realms/common";
import { profileToState, computeDerivedStats, xpToNextLevel } from "@realms/common";
import type { ServerWebSocket } from "bun";

export interface SessionData {
  sessionId: string;
}

export class CharacterSession {
  readonly sessionId: string;
  readonly characterDid: string;
  readonly state: CharacterState;
  ws: ServerWebSocket<SessionData> | null = null;

  // Combat state
  combatTarget: string | null = null;
  isDefending: boolean = false;
  private formulas: Record<string, FormulaDef>;

  constructor(sessionId: string, characterDid: string, profile: CharacterProfile, spawnRoom: string, formulas: Record<string, FormulaDef> = {}) {
    this.sessionId = sessionId;
    this.characterDid = characterDid;
    this.state = profileToState(profile, spawnRoom, formulas);
    this.formulas = formulas;
  }

  get currentRoom(): string {
    return this.state.currentRoom;
  }

  set currentRoom(roomId: string) {
    this.state.currentRoom = roomId;
  }

  get name(): string {
    return this.state.name;
  }

  get isConnected(): boolean {
    return this.ws !== null;
  }

  get inCombat(): boolean {
    return this.combatTarget !== null;
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(data);
    }
  }

  // ── Inventory ──

  addItem(item: ItemInstance): void {
    // Try to stack with existing item of same definition
    const existing = this.state.inventory.find(
      (i) => i.definitionId === item.definitionId
    );
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      this.state.inventory.push({ ...item });
    }
  }

  removeItem(identifier: string, quantity: number = 1): ItemInstance | undefined {
    const lower = identifier.toLowerCase();
    const index = this.state.inventory.findIndex(
      (i) => i.instanceId === identifier || i.name.toLowerCase().includes(lower)
    );
    if (index === -1) return undefined;

    const item = this.state.inventory[index];
    if (quantity >= item.quantity) {
      this.state.inventory.splice(index, 1);
      return item;
    }

    item.quantity -= quantity;
    return {
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      name: item.name,
      quantity,
      properties: item.properties,
    };
  }

  findItem(identifier: string): ItemInstance | undefined {
    const lower = identifier.toLowerCase();
    return this.state.inventory.find(
      (i) => i.instanceId === identifier || i.name.toLowerCase().includes(lower)
    );
  }

  get inventory(): ItemInstance[] {
    return this.state.inventory;
  }

  // ── Equipment ──

  get equipment(): Record<string, ItemInstance> {
    return this.state.equipment;
  }

  equip(slot: string, item: ItemInstance): ItemInstance | undefined {
    const previous = this.state.equipment[slot];
    this.state.equipment[slot] = item;
    return previous;
  }

  unequip(slot: string): ItemInstance | undefined {
    const item = this.state.equipment[slot];
    if (item) {
      delete this.state.equipment[slot];
    }
    return item;
  }

  getEquipped(slot: string): ItemInstance | undefined {
    return this.state.equipment[slot];
  }

  // ── Combat ──

  takeDamage(amount: number): void {
    this.state.currentHp = Math.max(0, this.state.currentHp - amount);
  }

  heal(amount: number): void {
    this.state.currentHp = Math.min(this.state.maxHp, this.state.currentHp + amount);
  }

  restoreMana(amount: number): void {
    this.state.currentMp = Math.min(this.state.maxMp, this.state.currentMp + amount);
  }

  get isDead(): boolean {
    return this.state.currentHp <= 0;
  }

  // ── XP and Leveling ──

  addXp(amount: number): number | null {
    this.state.experience += amount;

    // Check for level up
    const newLevel = this.checkLevelUp();
    if (newLevel > this.state.level) {
      const oldLevel = this.state.level;
      this.state.level = newLevel;
      this.recalculateDerived();
      // Heal to full on level up
      this.state.currentHp = this.state.maxHp;
      this.state.currentMp = this.state.maxMp;
      return newLevel;
    }
    return null;
  }

  private checkLevelUp(): number {
    let level = this.state.level;
    const xpForLevel = (l: number) => l * (l - 1) * 50;
    while (this.state.experience >= xpForLevel(level + 1)) {
      level++;
    }
    return level;
  }

  private recalculateDerived(): void {
    const derived = computeDerivedStats(this.formulas, this.state.level, this.state.attributes);
    this.state.maxHp = derived.maxHp ?? this.state.maxHp;
    this.state.maxMp = derived.maxMp ?? this.state.maxMp;
    this.state.maxAp = derived.maxAp ?? this.state.maxAp;
  }

  /** Respawn at a room with 1 HP */
  respawn(spawnRoom: string): void {
    this.state.currentRoom = spawnRoom;
    this.state.currentHp = Math.max(1, Math.floor(this.state.maxHp * 0.25));
    this.state.currentMp = Math.max(0, Math.floor(this.state.maxMp * 0.25));
    this.combatTarget = null;
    this.isDefending = false;
  }
}
