import { loadConfig } from "./config.js";
import { WorldManager } from "./world/world-manager.js";
import { SessionManager } from "./server/session-manager.js";
import { type SessionData } from "./entities/character-session.js";
import { parseCommand } from "@realms/common";
import { encodeMessage, decodeClientMessage, type ServerMessage } from "@realms/protocol";
import {
  handleCommand,
  sendRoomState,
  sendMapUpdate,
  sendNarrative,
  type CommandContext,
} from "./commands/index.js";
import type { CharacterProfile } from "@realms/lexicons";
import { buildAttributes, computeDerivedStats, xpToNextLevel } from "@realms/common";
import { BlueskyBridge } from "./bluesky/bridge.js";
import { CombatSystem } from "./systems/combat-system.js";
import { ServerIdentity } from "./atproto/server-identity.js";
import { GameOAuthClient } from "./atproto/oauth.js";
import { PdsClient } from "./atproto/pds-client.js";
import { PortalHandler } from "./federation/portal-handler.js";
import { TransferHandler } from "./federation/transfer-handler.js";
import { WorldPublisher } from "./atproto/world-publisher.js";
import { FederationManager } from "./federation/federation-manager.js";

const config = loadConfig();
const world = new WorldManager(config);
const sessions = new SessionManager();
const bluesky = new BlueskyBridge(config.bluesky);
const serverIdentity = new ServerIdentity();
const oauthClient = new GameOAuthClient();
const pdsClient = new PdsClient(serverIdentity);

const DEV_MODE = process.env.DEV_MODE === "true";
const portalHandler = new PortalHandler(serverIdentity, pdsClient, config.federation);
const transferHandler = new TransferHandler(
  serverIdentity,
  sessions,
  world,
  config.federation,
  config.atproto,
  config.name,
);

await world.initialize();
await bluesky.initialize();

// Initialize AT Proto services (skip in dev mode or if PDS is not configured)
if (!DEV_MODE && config.atproto.serverPassword) {
  try {
    await serverIdentity.initialize(config.atproto, config.name, config.description);
    await oauthClient.initialize(config.atproto);
    sessions.setServerIdentity(serverIdentity);

    // Publish world data as AT Proto records
    const publisher = new WorldPublisher(serverIdentity.agent, serverIdentity.did);
    const { portalCount } = await publisher.publishAll(world);

    // Federation: publish registration and seed known servers
    const federation = new FederationManager(
      serverIdentity,
      config.federation,
      config.atproto,
      config.name,
      config.description,
    );
    await federation.publishRegistration(portalCount, 0);
    await federation.seedFromConfig();
  } catch (err) {
    console.warn("   AT Proto initialization failed:", err instanceof Error ? err.message : err);
    console.warn("   Running without AT Proto auth (set DEV_MODE=true to suppress)");
  }
}

function broadcast(roomId: string, msg: ServerMessage, excludeSessionId?: string): void {
  const room = world.getRoom(roomId);
  if (!room) return;

  const encoded = encodeMessage(msg);
  for (const playerId of room.getPlayerIds()) {
    if (playerId === excludeSessionId) continue;
    const session = sessions.getSession(playerId);
    session?.send(encoded);
  }
}

const combat = new CombatSystem({ world, sessions, broadcast });

function makeContext(sessionId: string): CommandContext | null {
  const session = sessions.getSession(sessionId);
  if (!session) return null;
  return { session, world, sessions, broadcast, bluesky, combat, portalHandler };
}

function buildCharacterProfile(
  name: string,
  classId: string = "warrior",
  raceId: string = "human",
): CharacterProfile {
  const system = world.gameSystem;
  const attributes = buildAttributes(system, classId, raceId);
  const derived = computeDerivedStats(system.formulas, 1, attributes);

  return {
    name,
    class: classId,
    race: raceId,
    level: 1,
    experience: 0,
    attributes,
    derived,
    createdAt: new Date().toISOString(),
  };
}

// ── Game Tick Loop ──
// Processes NPC respawns and other periodic game events
const TICK_INTERVAL_MS = 5000; // 5 second tick for respawns

setInterval(() => {
  // Process NPC respawns
  const respawned = world.npcManager.processRespawns((id) => world.getRoom(id));
  for (const npc of respawned) {
    const room = world.getRoom(npc.currentRoom);
    if (room) {
      broadcast(room.id, {
        type: "narrative",
        text: `${npc.name} appears.`,
        style: "info",
      });
    }
  }

  // Process buff/debuff ticks for all players
  for (const session of sessions.getAllSessions()) {
    if (session.state.activeEffects.length === 0) continue;

    const expired = session.tickEffects();
    if (expired.length > 0) {
      const names = expired.join(", ");
      session.send(
        encodeMessage({
          type: "narrative",
          text: `Effect${expired.length > 1 ? "s" : ""} worn off: ${names}`,
          style: "info",
        }),
      );
      // Send updated stats
      const s = session.state;
      session.send(
        encodeMessage({
          type: "character_update",
          hp: s.currentHp,
          maxHp: s.maxHp,
          mp: s.currentMp,
          maxMp: s.maxMp,
          ap: s.currentAp,
          maxAp: s.maxAp,
          gold: s.gold,
          level: s.level,
          xp: s.experience,
          xpToNext: xpToNextLevel(s.level, s.experience),
        }),
      );
    }
  }
}, TICK_INTERVAL_MS);

// ── Periodic Attestation Flush ──
// Flush pending attestation claims for all sessions every 15 minutes
// so accumulated gold/item changes aren't lost to crashes or long sessions.
const ATTESTATION_FLUSH_MS = 15 * 60 * 1000;

setInterval(() => {
  for (const session of sessions.getAllSessions()) {
    session.attestations.flush();
  }
}, ATTESTATION_FLUSH_MS);

const server = Bun.serve<SessionData>({
  port: config.port,
  hostname: config.host,

  async fetch(req, server) {
    const url = new URL(req.url);

    // ── WebSocket upgrade ──
    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("session");

      if (sessionId && sessions.getSession(sessionId)) {
        const upgraded = server.upgrade(req, { data: { sessionId } });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }

      if (DEV_MODE) {
        // Dev mode: create session on connect with query params
        const name =
          url.searchParams.get("name") ?? `Adventurer_${Math.floor(Math.random() * 9999)}`;
        const classId = url.searchParams.get("class") ?? "warrior";
        const raceId = url.searchParams.get("race") ?? "human";

        const profile = buildCharacterProfile(name, classId, raceId);
        const session = sessions.createSession(
          `dev:${name}`,
          profile,
          world.getDefaultSpawnRoom(),
          world.gameSystem.formulas,
        );

        const upgraded = server.upgrade(req, { data: { sessionId: session.sessionId } });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }

      return new Response(
        "Invalid session. Authenticate via /xrpc/com.cacheblasters.fm.action.connect first.",
        { status: 401 },
      );
    }

    // ── OAuth routes ──

    // OAuth client metadata (served for AT Proto client discovery)
    if (url.pathname === "/oauth/client-metadata.json") {
      return Response.json(oauthClient.getClientMetadata(config.atproto.publicUrl));
    }

    // Start OAuth flow
    if (url.pathname === "/auth/login" && req.method === "GET") {
      const handle = url.searchParams.get("handle");
      if (!handle) {
        return Response.json({ error: "handle parameter required" }, { status: 400 });
      }
      try {
        const authUrl = await oauthClient.authorize(handle);
        return Response.json({ url: authUrl.toString() });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "OAuth failed" },
          { status: 500 },
        );
      }
    }

    // OAuth callback
    if (url.pathname === "/oauth/callback") {
      try {
        const { session: oauthSession, agent } = await oauthClient.callback(url.searchParams);
        const did = oauthSession.did;

        // Check if player has a character on this server
        const existingProfile = await pdsClient.loadCharacter(agent, did);
        if (existingProfile) {
          // Returning player — create game session
          const gameSession = sessions.createSession(
            did,
            existingProfile,
            world.getDefaultSpawnRoom(),
            world.gameSystem.formulas,
          );
          return Response.json({
            sessionId: gameSession.sessionId,
            websocketUrl: `${config.atproto.publicUrl.replace(/^http/, "ws")}/ws?session=${gameSession.sessionId}`,
            spawnRoom: gameSession.currentRoom,
            characterState: gameSession.state,
          });
        }

        // New player — needs character creation
        return Response.json({
          needsCharacter: true,
          did,
          gameSystem: world.gameSystem,
        });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Callback failed" },
          { status: 500 },
        );
      }
    }

    // ── XRPC endpoints ──

    // Connect: authenticate and load or prompt character creation
    if (url.pathname === "/xrpc/com.cacheblasters.fm.action.connect" && req.method === "POST") {
      try {
        const body = (await req.json()) as { did: string };
        if (!body.did) {
          return Response.json({ error: "did is required" }, { status: 400 });
        }

        // Try to restore OAuth session and load character
        const agent = await oauthClient.restore(body.did);
        if (!agent) {
          return Response.json(
            { error: "No valid session. Please authenticate first." },
            { status: 401 },
          );
        }

        const profile = await pdsClient.loadCharacter(agent, body.did);
        if (profile) {
          const gameSession = sessions.createSession(
            body.did,
            profile,
            world.getDefaultSpawnRoom(),
            world.gameSystem.formulas,
          );
          return Response.json({
            sessionId: gameSession.sessionId,
            websocketUrl: `${config.atproto.publicUrl.replace(/^http/, "ws")}/ws?session=${gameSession.sessionId}`,
            spawnRoom: gameSession.currentRoom,
            characterState: gameSession.state,
          });
        }

        // New player
        return Response.json({
          needsCharacter: true,
          gameSystem: world.gameSystem,
        });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Connect failed" },
          { status: 500 },
        );
      }
    }

    // Create character: build a new character and write to PDS
    if (
      url.pathname === "/xrpc/com.cacheblasters.fm.action.createCharacter" &&
      req.method === "POST"
    ) {
      try {
        const body = (await req.json()) as {
          did: string;
          name: string;
          classId: string;
          raceId: string;
        };
        if (!body.did || !body.name || !body.classId || !body.raceId) {
          return Response.json(
            { error: "did, name, classId, and raceId are required" },
            { status: 400 },
          );
        }

        const agent = await oauthClient.restore(body.did);
        if (!agent) {
          return Response.json(
            { error: "No valid session. Please authenticate first." },
            { status: 401 },
          );
        }

        // Build character profile using this server's game system
        const profile = buildCharacterProfile(body.name, body.classId, body.raceId);

        // Write to player's PDS
        await pdsClient.saveCharacter(agent, body.did, profile);

        // Create game session
        const gameSession = sessions.createSession(
          body.did,
          profile,
          world.getDefaultSpawnRoom(),
          world.gameSystem.formulas,
        );
        return Response.json({
          sessionId: gameSession.sessionId,
          websocketUrl: `${config.atproto.publicUrl.replace(/^http/, "ws")}/ws?session=${gameSession.sessionId}`,
          spawnRoom: gameSession.currentRoom,
          characterState: gameSession.state,
        });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Character creation failed" },
          { status: 500 },
        );
      }
    }

    // Federation: receive character transfer from another server
    if (
      url.pathname === "/xrpc/com.cacheblasters.fm.federation.transfer" &&
      req.method === "POST"
    ) {
      try {
        const body = (await req.json()) as {
          token: string;
          character: Record<string, unknown>;
          attestations?: unknown[];
        };
        if (!body.token || !body.character) {
          return Response.json({ error: "token and character are required" }, { status: 400 });
        }
        const result = await transferHandler.handleTransfer(body);
        return Response.json(result);
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Transfer failed" },
          { status: 500 },
        );
      }
    }

    // ── Account creation (proxied to co-located PDS) ──

    if (url.pathname === "/auth/create-account" && req.method === "POST") {
      try {
        const body = (await req.json()) as { handle: string; email: string; password: string };
        if (!body.handle || !body.email || !body.password) {
          return Response.json(
            { error: "handle, email, and password are required" },
            { status: 400 },
          );
        }

        // Resolve handle: if no dot, append the PDS hostname
        const handle = body.handle.includes(".")
          ? body.handle
          : `${body.handle}.${config.atproto.pdsHostname}`;

        const pdsRes = await fetch(
          `${config.atproto.pdsUrl}/xrpc/com.atproto.server.createAccount`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle, email: body.email, password: body.password }),
          },
        );

        if (!pdsRes.ok) {
          const errData = (await pdsRes.json().catch(() => ({}))) as { message?: string };
          return Response.json(
            { error: errData.message ?? `Account creation failed (${pdsRes.status})` },
            { status: pdsRes.status },
          );
        }

        const data = (await pdsRes.json()) as { did: string; handle: string };
        return Response.json({ did: data.did, handle: data.handle });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Account creation failed" },
          { status: 500 },
        );
      }
    }

    // ── Info routes ──

    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        server: config.name,
        players: sessions.getOnlineCount(),
        serverDid: serverIdentity.did || undefined,
      });
    }

    // Server info
    if (url.pathname === "/info") {
      return Response.json({
        name: config.name,
        description: config.description,
        players: sessions.getOnlineCount(),
        rooms: world.areaManager.getAllRooms().size,
        serverDid: serverIdentity.did || undefined,
        pdsHostname: config.atproto.pdsHostname,
      });
    }

    // Game system schema
    if (url.pathname === "/system") {
      return Response.json(world.gameSystem);
    }

    return new Response("Federated Realms Dungeon Server", { status: 200 });
  },

  websocket: {
    open(ws: import("bun").ServerWebSocket<SessionData>) {
      const session = sessions.attachWebSocket(ws.data.sessionId, ws);
      if (!session) {
        ws.close(4001, "Invalid session");
        return;
      }

      console.log(`Player connected: ${session.name} (${session.sessionId})`);

      // Place player in spawn room
      const spawnRoom = world.getRoom(session.currentRoom);
      if (spawnRoom) {
        spawnRoom.addPlayer(session.sessionId, session.name);

        // Notify room
        broadcast(
          spawnRoom.id,
          {
            type: "entity_enter",
            entity: { id: session.sessionId, name: session.name, type: "player" },
            room: spawnRoom.id,
          },
          session.sessionId,
        );
      }

      // Send welcome
      session.send(
        encodeMessage({
          type: "welcome",
          sessionId: session.sessionId,
          serverName: config.name,
        }),
      );

      // Post to Bluesky
      bluesky.post({
        type: "system",
        roomId: session.currentRoom,
        roomTitle: spawnRoom?.title ?? session.currentRoom,
        playerName: session.name,
        playerDid: session.characterDid,
        text: `${session.name} has entered the realm.`,
      });

      // Send initial character stats + inventory
      const s = session.state;
      session.send(
        encodeMessage({
          type: "character_update",
          hp: s.currentHp,
          maxHp: s.maxHp,
          mp: s.currentMp,
          maxMp: s.maxMp,
          ap: s.currentAp,
          maxAp: s.maxAp,
          gold: s.gold,
          level: s.level,
          xp: s.experience,
          xpToNext: xpToNextLevel(s.level, s.experience),
        }),
      );
      session.send(
        encodeMessage({
          type: "inventory_update",
          inventory: s.inventory,
        }),
      );
      session.send(
        encodeMessage({
          type: "equipment_update",
          equipment: s.equipment,
        }),
      );

      // Send quest log
      const questLog = world.questManager.buildLogPayload(session.characterDid);
      session.send(encodeMessage(questLog));

      // Send initial room state and map
      const ctx = makeContext(session.sessionId);
      if (ctx) {
        sendRoomState(session, ctx);
        sendMapUpdate(session, ctx);
      }

      // Check for pending portal adaptation (foreign class/race)
      const adaptation = transferHandler.buildAdaptationMessage(session.sessionId);
      if (adaptation) {
        const parts: string[] = [];
        if (adaptation.class) parts.push(`class "${adaptation.class.original}"`);
        if (adaptation.race) parts.push(`race "${adaptation.race.original}"`);
        session.send(
          encodeMessage({
            type: "adaptation_required",
            adaptation,
            message: `This realm doesn't recognize your ${parts.join(" or ")}. Please choose a local equivalent.`,
          }),
        );
      }
    },

    message(ws: import("bun").ServerWebSocket<SessionData>, message: string | Buffer) {
      const data = typeof message === "string" ? message : message.toString();
      const clientMsg = decodeClientMessage(data);

      if (!clientMsg) return;

      const ctx = makeContext(ws.data.sessionId);
      if (!ctx) return;

      switch (clientMsg.type) {
        case "command": {
          const parsed = parseCommand(`${clientMsg.command} ${clientMsg.args.join(" ")}`.trim());
          handleCommand(parsed, ctx);
          ctx.session.send(encodeMessage({ type: "ack", id: clientMsg.id }));
          break;
        }

        case "move": {
          const parsed = parseCommand(`go ${clientMsg.direction}`);
          handleCommand(parsed, ctx);
          ctx.session.send(encodeMessage({ type: "ack", id: clientMsg.id }));
          break;
        }

        case "chat": {
          const verb = clientMsg.channel === "shout" ? "shout" : "say";
          const parsed = parseCommand(`${verb} ${clientMsg.message}`);
          handleCommand(parsed, ctx);
          break;
        }

        case "adaptation_response": {
          const applied = transferHandler.applyAdaptation(
            ws.data.sessionId,
            clientMsg.classId,
            clientMsg.raceId,
          );
          if (applied) {
            // Resend character state with updated class/race/stats
            const s = ctx.session.state;
            ctx.session.send(
              encodeMessage({
                type: "character_update",
                hp: s.currentHp,
                maxHp: s.maxHp,
                mp: s.currentMp,
                maxMp: s.maxMp,
                ap: s.currentAp,
                maxAp: s.maxAp,
                gold: s.gold,
                level: s.level,
                xp: s.experience,
                xpToNext: xpToNextLevel(s.level, s.experience),
              }),
            );
            sendNarrative(
              ctx.session,
              `Your form shifts to match this realm. You are now a ${s.race} ${s.class}.`,
              "system",
            );
          }
          break;
        }

        case "ping": {
          ctx.session.send(encodeMessage({ type: "pong", serverTime: Date.now() }));
          break;
        }
      }
    },

    close(ws: import("bun").ServerWebSocket<SessionData>) {
      const session = sessions.getSession(ws.data.sessionId);
      if (!session) return;

      console.log(`Player disconnected: ${session.name}`);

      // End combat if in combat — reset ALL combat NPCs, not just the target
      if (session.inCombat) {
        combat.disengageAll(session);
      }

      // Remove from room
      const room = world.getRoom(session.currentRoom);
      if (room) {
        const entity = room.removePlayer(session.sessionId);
        if (entity) {
          broadcast(room.id, {
            type: "entity_leave",
            entity,
            room: room.id,
          });
        }
      }

      // Post to Bluesky
      bluesky.post({
        type: "system",
        roomId: session.currentRoom,
        roomTitle: room?.title ?? session.currentRoom,
        playerName: session.name,
        playerDid: session.characterDid,
        text: `${session.name} has left the realm.`,
      });

      // Finalize attestations and store in character profile extensions
      session.attestations
        .finalize()
        .then((attestations) => {
          if (attestations.length > 0) {
            const s = session.state;
            const serverExt =
              (s.extensions?.[serverIdentity.did] as { attestations?: unknown[] } | undefined) ??
              {};
            const existing = serverExt.attestations ?? [];
            s.extensions = {
              ...s.extensions,
              [serverIdentity.did]: {
                ...serverExt,
                attestations: [...existing, ...attestations],
              },
            };
          }
        })
        .catch((err) => {
          console.warn(
            `Failed to finalize attestations for ${session.name}:`,
            err instanceof Error ? err.message : err,
          );
        });

      transferHandler.pendingAdaptations.delete(session.sessionId);
      sessions.removeSession(session.sessionId);
    },
  },
});

console.log(`\n⚔️  ${config.name}`);
console.log(`   Listening on ${server.hostname}:${server.port}`);
console.log(`   WebSocket: ws://${server.hostname}:${server.port}/ws`);
console.log(`   Health: http://${server.hostname}:${server.port}/health`);
if (DEV_MODE) {
  console.log(`   Mode: DEV (no auth required)`);
} else if (serverIdentity.did) {
  console.log(`   Server DID: ${serverIdentity.did}`);
  console.log(`   OAuth: ${config.atproto.publicUrl}/oauth/client-metadata.json`);
}
console.log();
