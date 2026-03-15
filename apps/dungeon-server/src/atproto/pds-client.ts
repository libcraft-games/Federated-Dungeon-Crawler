import type { Agent, AtpAgent } from "@atproto/api";

type AnyAgent = Agent | AtpAgent;
import { NSID, type CharacterProfile } from "@realms/lexicons";
import type { ServerIdentity } from "./server-identity.js";

/**
 * Reads and writes character/quest data to a player's PDS.
 * Uses the server's authenticated agent to act on behalf of the server account.
 * For player PDS writes, uses the player's own agent (obtained via OAuth).
 */
export class PdsClient {
  constructor(private serverIdentity: ServerIdentity) {}

  /**
   * Load a character profile from the player's PDS.
   * Returns null if no character exists (new player).
   */
  async loadCharacter(playerAgent: AnyAgent, did: string): Promise<CharacterProfile | null> {
    try {
      const { data } = await playerAgent.com.atproto.repo.getRecord({
        repo: did,
        collection: NSID.CharacterProfile,
        rkey: "self",
      });
      return data.value as unknown as CharacterProfile;
    } catch (err: unknown) {
      // 404 means no character yet — that's fine
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /**
   * Save character profile to the player's PDS.
   * Called on level up, disconnect, and periodically.
   */
  async saveCharacter(
    playerAgent: AnyAgent,
    did: string,
    profile: CharacterProfile,
  ): Promise<void> {
    await playerAgent.com.atproto.repo.putRecord({
      repo: did,
      collection: NSID.CharacterProfile,
      rkey: "self",
      record: {
        $type: NSID.CharacterProfile,
        ...profile,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Save quest progress to the player's PDS.
   */
  async saveQuestProgress(
    playerAgent: AnyAgent,
    did: string,
    questId: string,
    progress: {
      questId: string;
      serverId: string;
      status: string;
      objectives: Record<string, unknown>[];
      acceptedAt: string;
      completedAt?: string;
    },
  ): Promise<void> {
    const rkey = questId.replace(/[^a-zA-Z0-9-]/g, "-");
    await playerAgent.com.atproto.repo.putRecord({
      repo: did,
      collection: NSID.QuestProgress,
      rkey,
      record: {
        $type: NSID.QuestProgress,
        ...progress,
        serverId: this.serverIdentity.did,
      },
    });
  }

  /**
   * Load all quest progress records from the player's PDS.
   */
  async loadQuestProgress(
    playerAgent: AnyAgent,
    did: string,
  ): Promise<Array<{ questId: string; status: string; objectives: Record<string, unknown>[] }>> {
    try {
      const { data } = await playerAgent.com.atproto.repo.listRecords({
        repo: did,
        collection: NSID.QuestProgress,
        limit: 100,
      });
      return data.records.map(
        (r) =>
          r.value as unknown as {
            questId: string;
            status: string;
            objectives: Record<string, unknown>[];
          },
      );
    } catch (err: unknown) {
      if (isNotFound(err)) return [];
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status: number }).status === 404;
  }
  return false;
}
