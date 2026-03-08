import type { CharacterProfile, FormulaDef } from "@realms/lexicons";
import type { CharacterState } from "@realms/common";
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
}
