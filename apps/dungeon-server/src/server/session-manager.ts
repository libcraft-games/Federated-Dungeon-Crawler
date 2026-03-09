import type { CharacterProfile, FormulaDef } from "@realms/lexicons";
import { CharacterSession, type SessionData } from "../entities/character-session.js";
import type { ServerWebSocket } from "bun";

export class SessionManager {
  private sessions = new Map<string, CharacterSession>();
  private didToSession = new Map<string, string>();

  createSession(characterDid: string, profile: CharacterProfile, spawnRoom: string, formulas: Record<string, FormulaDef> = {}): CharacterSession {
    // If player already has a session, remove it
    const existingSessionId = this.didToSession.get(characterDid);
    if (existingSessionId) {
      this.removeSession(existingSessionId);
    }

    const sessionId = crypto.randomUUID();
    const session = new CharacterSession(sessionId, characterDid, profile, spawnRoom, formulas);
    this.sessions.set(sessionId, session);
    this.didToSession.set(characterDid, sessionId);
    return session;
  }

  attachWebSocket(sessionId: string, ws: ServerWebSocket<SessionData>): CharacterSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ws = ws;
    }
    return session;
  }

  getSession(sessionId: string): CharacterSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByDid(did: string): CharacterSession | undefined {
    const sessionId = this.didToSession.get(did);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  findByName(name: string): CharacterSession | undefined {
    const lower = name.toLowerCase();
    for (const session of this.sessions.values()) {
      if (session.name.toLowerCase() === lower) return session;
    }
    return undefined;
  }

  removeSession(sessionId: string): CharacterSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.didToSession.delete(session.characterDid);
      session.ws = null;
    }
    return session;
  }

  getAllSessions(): CharacterSession[] {
    return [...this.sessions.values()];
  }

  getOnlineCount(): number {
    return this.sessions.size;
  }
}
