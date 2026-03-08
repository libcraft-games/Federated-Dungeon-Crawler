import type { CharacterProfile, FormulaDef } from "@realms/lexicons";
import type { CharacterState, ItemInstance } from "@realms/common";
import { profileToState } from "@realms/common";
import type { ServerWebSocket } from "bun";

export interface SessionData {
  sessionId: string;
}

export class CharacterSession {
  readonly sessionId: string;
  readonly characterDid: string;
  readonly state: CharacterState;
  ws: ServerWebSocket<SessionData> | null = null;

  constructor(sessionId: string, characterDid: string, profile: CharacterProfile, spawnRoom: string, formulas: Record<string, FormulaDef> = {}) {
    this.sessionId = sessionId;
    this.characterDid = characterDid;
    this.state = profileToState(profile, spawnRoom, formulas);
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

  send(data: string): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(data);
    }
  }

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
}
