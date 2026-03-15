import type { CharacterProfile } from "@realms/lexicons";
import type { ServerIdentity } from "../atproto/server-identity.js";
import type { SessionManager } from "../server/session-manager.js";
import type { WorldManager } from "../world/world-manager.js";
import type { FederationConfig, AtProtoConfig } from "../config.js";
import type { AdaptationRequired } from "@realms/protocol";
import { buildAttributes, computeDerivedStats } from "@realms/common";

export interface TransferInput {
  token: string;
  character: Record<string, unknown>;
  attestations?: unknown[];
}

export interface TransferOutput {
  accepted: boolean;
  sessionId?: string;
  websocketUrl?: string;
  spawnRoom?: string;
  serverName?: string;
  reason?: string;
}

/**
 * Tracks a session that needs the player to choose a local class/race
 * to replace their incompatible foreign one.
 */
export interface PendingAdaptation {
  originalClass: string;
  originalRace: string;
  needsClass: boolean;
  needsRace: boolean;
  sourceCharacter: CharacterProfile & {
    gold?: number;
    inventory?: unknown[];
    equipment?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
  };
}

/**
 * Handles incoming character transfer requests from other servers.
 * Validates the transfer JWT, applies trust policies, adapts the
 * character to the local game system, and creates a session.
 *
 * When the incoming character's class or race doesn't exist locally,
 * a temporary session is created and the player is prompted to choose
 * from the local server's options via an adaptation_required message.
 */
export class TransferHandler {
  /** Sessions waiting for the player to pick a local class/race */
  readonly pendingAdaptations = new Map<string, PendingAdaptation>();

  constructor(
    private serverIdentity: ServerIdentity,
    private sessionManager: SessionManager,
    private world: WorldManager,
    private federationConfig: FederationConfig,
    private atprotoConfig: AtProtoConfig,
    private serverName: string,
  ) {}

  async handleTransfer(input: TransferInput): Promise<TransferOutput> {
    // 1. Verify transfer JWT
    const payload = await this.serverIdentity.verifyTransferToken(
      input.token,
      this.serverIdentity.did,
    );
    if (!payload) {
      return { accepted: false, reason: "Invalid transfer token" };
    }

    // 2. Check expiry
    if (payload.exp < Date.now() / 1000) {
      return { accepted: false, reason: "Transfer token expired" };
    }

    // 3. Verify audience (token is meant for us)
    if (payload.aud !== this.serverIdentity.did) {
      return { accepted: false, reason: "Transfer token not addressed to this server" };
    }

    // 4. Verify character hash
    const hash = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify(input.character))
      .digest("hex");
    if (hash !== payload.characterHash) {
      return { accepted: false, reason: "Character data was tampered with" };
    }

    // 5. Apply trust policy to incoming character
    const character = input.character as unknown as CharacterProfile & {
      gold?: number;
      inventory?: unknown[];
      equipment?: Record<string, unknown>;
      extensions?: Record<string, unknown>;
      homeServer?: string;
    };

    const trustedCharacter = this.applyTrustPolicy(character, payload.iss);

    // 6. Check level cap
    if (trustedCharacter.level > this.federationConfig.maxAcceptedLevel) {
      return {
        accepted: false,
        reason: `Level ${trustedCharacter.level} exceeds server maximum (${this.federationConfig.maxAcceptedLevel})`,
      };
    }

    // 7. Check compatibility and adapt or flag for player choice
    const localSystem = this.world.gameSystem;
    const needsClass = !localSystem.classes[trustedCharacter.class];
    const needsRace = !localSystem.races[trustedCharacter.race];

    // Use temporary defaults for the initial session profile
    const tempClassId = needsClass
      ? (Object.keys(localSystem.classes)[0] ?? "warrior")
      : trustedCharacter.class;
    const tempRaceId = needsRace
      ? (Object.keys(localSystem.races)[0] ?? "human")
      : trustedCharacter.race;

    const adaptedProfile = this.buildAdaptedProfile(trustedCharacter, tempClassId, tempRaceId);

    // 8. Resolve spawn room
    const targetRoom = payload.targetRoom;
    const spawnRoom = this.world.getRoom(targetRoom)
      ? targetRoom
      : this.world.getDefaultSpawnRoom();

    // 9. Create session
    const session = this.sessionManager.createSession(
      payload.sub,
      adaptedProfile,
      spawnRoom,
      this.world.gameSystem.formulas,
    );

    // 10. If adaptation needed, store pending and let the WS open handler prompt
    if (needsClass || needsRace) {
      this.pendingAdaptations.set(session.sessionId, {
        originalClass: trustedCharacter.class,
        originalRace: trustedCharacter.race,
        needsClass,
        needsRace,
        sourceCharacter: trustedCharacter,
      });
    }

    return {
      accepted: true,
      sessionId: session.sessionId,
      websocketUrl: `${this.atprotoConfig.publicUrl.replace(/^http/, "ws")}/ws?session=${session.sessionId}`,
      spawnRoom,
      serverName: this.serverName,
    };
  }

  /**
   * Build the adaptation_required payload for a pending session.
   * Called from the WebSocket open handler.
   */
  buildAdaptationMessage(sessionId: string): AdaptationRequired | null {
    const pending = this.pendingAdaptations.get(sessionId);
    if (!pending) return null;

    const localSystem = this.world.gameSystem;
    const adaptation: AdaptationRequired = {};

    if (pending.needsClass) {
      adaptation.class = {
        original: pending.originalClass,
        options: Object.entries(localSystem.classes).map(([id, def]) => ({
          id,
          name: (def as { name?: string }).name ?? id,
          description: (def as { description?: string }).description ?? "",
        })),
      };
    }

    if (pending.needsRace) {
      adaptation.race = {
        original: pending.originalRace,
        options: Object.entries(localSystem.races).map(([id, def]) => ({
          id,
          name: (def as { name?: string }).name ?? id,
          description: (def as { description?: string }).description ?? "",
        })),
      };
    }

    return adaptation;
  }

  /**
   * Apply the player's adaptation choices to their session.
   * Called when the client sends an adaptation_response message.
   */
  applyAdaptation(sessionId: string, classId?: string, raceId?: string): boolean {
    const pending = this.pendingAdaptations.get(sessionId);
    if (!pending) return false;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.pendingAdaptations.delete(sessionId);
      return false;
    }

    const localSystem = this.world.gameSystem;

    // Validate choices
    const finalClass =
      classId && localSystem.classes[classId]
        ? classId
        : (Object.keys(localSystem.classes)[0] ?? "warrior");
    const finalRace =
      raceId && localSystem.races[raceId] ? raceId : (Object.keys(localSystem.races)[0] ?? "human");

    // Rebuild the character with chosen class/race
    const profile = this.buildAdaptedProfile(pending.sourceCharacter, finalClass, finalRace);

    // Update session state
    const s = session.state;
    s.class = profile.class;
    s.race = profile.race;

    // Recompute attributes and derived stats
    const attributes = buildAttributes(localSystem, finalClass, finalRace);
    for (const [key, value] of Object.entries(pending.sourceCharacter.attributes)) {
      if (attributes[key] !== undefined) {
        attributes[key] = Math.max(attributes[key], value);
      }
    }
    s.attributes = attributes;

    const derived = computeDerivedStats(localSystem.formulas, s.level, attributes);
    s.maxHp = derived.maxHp;
    s.maxMp = derived.maxMp;
    s.maxAp = derived.maxAp;
    s.currentHp = Math.min(s.currentHp, s.maxHp);
    s.currentMp = Math.min(s.currentMp, s.maxMp);
    s.currentAp = Math.min(s.currentAp, s.maxAp);

    // Store original class/race in extensions for when they return
    s.extensions = {
      ...s.extensions,
      _originalClass: pending.originalClass,
      _originalRace: pending.originalRace,
    };

    this.pendingAdaptations.delete(sessionId);
    return true;
  }

  private applyTrustPolicy(
    character: CharacterProfile & {
      gold?: number;
      inventory?: unknown[];
      equipment?: Record<string, unknown>;
      extensions?: Record<string, unknown>;
    },
    sourceServerDid: string,
  ): CharacterProfile & {
    gold?: number;
    inventory?: unknown[];
    equipment?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
  } {
    switch (this.federationConfig.trustPolicy) {
      case "trust-all":
        return character;

      case "trust-listed":
        if (this.federationConfig.trustedServers.includes(sourceServerDid)) {
          return character;
        }
        // Untrusted: strip items/gold, keep level/XP/attributes
        return {
          ...character,
          gold: 0,
          inventory: [],
          equipment: {},
          extensions: {},
        };

      case "trust-none":
        return {
          ...character,
          gold: 0,
          inventory: [],
          equipment: {},
          extensions: {},
        };

      case "trust-level-cap":
        return {
          ...character,
          level: Math.min(character.level, this.federationConfig.maxAcceptedLevel),
        };
    }
  }

  private buildAdaptedProfile(
    character: CharacterProfile & { gold?: number; extensions?: Record<string, unknown> },
    classId: string,
    raceId: string,
  ): CharacterProfile {
    const localSystem = this.world.gameSystem;

    const attributes = buildAttributes(localSystem, classId, raceId);
    // Preserve attribute bonuses from levels
    for (const [key, value] of Object.entries(character.attributes)) {
      if (attributes[key] !== undefined) {
        attributes[key] = Math.max(attributes[key], value);
      }
    }

    const derived = computeDerivedStats(localSystem.formulas, character.level, attributes);

    return {
      name: character.name,
      class: classId,
      race: raceId,
      level: character.level,
      experience: character.experience,
      attributes,
      derived,
      createdAt: character.createdAt,
      extensions: character.extensions,
    };
  }
}
