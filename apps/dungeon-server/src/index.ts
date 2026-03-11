import { loadConfig } from "./config.js";
import { WorldManager } from "./world/world-manager.js";
import { SessionManager } from "./server/session-manager.js";
import { type SessionData } from "./entities/character-session.js";
import { parseCommand } from "@realms/common";
import { encodeMessage, decodeClientMessage, type ServerMessage } from "@realms/protocol";
import { handleCommand, sendRoomState, sendMapUpdate, sendNarrative, type CommandContext } from "./commands/index.js";
import type { CharacterProfile } from "@realms/lexicons";
import { buildAttributes, computeDerivedStats, xpToNextLevel } from "@realms/common";
import { BlueskyBridge } from "./bluesky/bridge.js";
import { CombatSystem } from "./systems/combat-system.js";

const config = loadConfig();
const world = new WorldManager(config);
const sessions = new SessionManager();
const bluesky = new BlueskyBridge(config.bluesky);

await world.initialize();
await bluesky.initialize();

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
  return { session, world, sessions, broadcast, bluesky, combat };
}

// Dev mode: create a quick character profile for testing without AT Proto auth
function createDevProfile(name: string, classId: string = "warrior", raceId: string = "human"): CharacterProfile {
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
      session.send(encodeMessage({
        type: "narrative",
        text: `Effect${expired.length > 1 ? "s" : ""} worn off: ${names}`,
        style: "info",
      }));
      // Send updated stats
      const s = session.state;
      session.send(encodeMessage({
        type: "character_update",
        hp: s.currentHp,
        maxHp: s.maxHp,
        mp: s.currentMp,
        maxMp: s.maxMp,
        ap: s.currentAp,
        maxAp: s.maxAp,
        level: s.level,
        xp: s.experience,
        xpToNext: xpToNextLevel(s.level, s.experience),
      }));
    }
  }
}, TICK_INTERVAL_MS);

const server = Bun.serve<SessionData>({
  port: config.port,
  hostname: config.host,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("session");

      if (sessionId && sessions.getSession(sessionId)) {
        // Existing session - attach WebSocket
        const upgraded = server.upgrade(req, { data: { sessionId } });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }

      // Dev mode: create session on connect with query params
      const name = url.searchParams.get("name") ?? `Adventurer_${Math.floor(Math.random() * 9999)}`;
      const classId = url.searchParams.get("class") ?? "warrior";
      const raceId = url.searchParams.get("race") ?? "human";

      const profile = createDevProfile(name, classId, raceId);
      const session = sessions.createSession(`dev:${name}`, profile, world.getDefaultSpawnRoom(), world.gameSystem.formulas);

      const upgraded = server.upgrade(req, { data: { sessionId: session.sessionId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined;
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        server: config.name,
        players: sessions.getOnlineCount(),
      });
    }

    // Server info
    if (url.pathname === "/info") {
      return Response.json({
        name: config.name,
        description: config.description,
        players: sessions.getOnlineCount(),
        rooms: world.areaManager.getAllRooms().size,
      });
    }

    // Game system schema (what attributes, classes, races this server uses)
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
          session.sessionId
        );
      }

      // Send welcome
      session.send(
        encodeMessage({
          type: "welcome",
          sessionId: session.sessionId,
          serverName: config.name,
        })
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
      session.send(encodeMessage({
        type: "character_update",
        hp: s.currentHp,
        maxHp: s.maxHp,
        mp: s.currentMp,
        maxMp: s.maxMp,
        ap: s.currentAp,
        maxAp: s.maxAp,
        level: s.level,
        xp: s.experience,
        xpToNext: xpToNextLevel(s.level, s.experience),
      }));
      session.send(encodeMessage({
        type: "inventory_update",
        inventory: s.inventory,
      }));

      // Send initial room state and map
      const ctx = makeContext(session.sessionId);
      if (ctx) {
        sendRoomState(session, ctx);
        sendMapUpdate(session, ctx);
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

      sessions.removeSession(session.sessionId);
    },
  },
});

console.log(`\n⚔️  ${config.name}`);
console.log(`   Listening on ${server.hostname}:${server.port}`);
console.log(`   WebSocket: ws://${server.hostname}:${server.port}/ws`);
console.log(`   Health: http://${server.hostname}:${server.port}/health\n`);
