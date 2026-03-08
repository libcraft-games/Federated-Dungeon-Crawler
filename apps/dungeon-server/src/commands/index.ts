import type { ParsedCommand } from "@realms/common";
import type { CharacterSession } from "../entities/character-session.js";
import type { WorldManager } from "../world/world-manager.js";
import type { SessionManager } from "../server/session-manager.js";
import { handleMovement } from "./movement.js";
import { handleLook } from "./interaction.js";
import { handleSocial } from "./social.js";
import { encodeMessage, type ServerMessage } from "@realms/protocol";
import { getCommandHelp } from "@realms/common";

export interface CommandContext {
  session: CharacterSession;
  world: WorldManager;
  sessions: SessionManager;
  broadcast: (roomId: string, msg: ServerMessage, excludeSessionId?: string) => void;
}

export function handleCommand(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session } = ctx;

  switch (cmd.verb) {
    case "go":
      handleMovement(cmd, ctx);
      break;

    case "look":
      handleLook(cmd, ctx);
      break;

    case "say":
    case "shout":
    case "whisper":
      handleSocial(cmd, ctx);
      break;

    case "who":
      handleWho(ctx);
      break;

    case "stats":
      handleStats(ctx);
      break;

    case "help":
      sendNarrative(session, getCommandHelp().join("\n"), "system");
      break;

    case "":
      break;

    default:
      sendNarrative(session, `Unknown command: ${cmd.verb}. Type 'help' for a list of commands.`, "error");
      break;
  }
}

function handleWho(ctx: CommandContext): void {
  const online = ctx.sessions.getAllSessions();
  if (online.length === 0) {
    sendNarrative(ctx.session, "No other adventurers are online.", "system");
    return;
  }

  const lines = ["Adventurers online:"];
  for (const s of online) {
    const room = ctx.world.getRoom(s.currentRoom);
    lines.push(`  ${s.name} - Level ${s.state.level} ${s.state.race} ${s.state.class} (${room?.title ?? "unknown"})`);
  }
  sendNarrative(ctx.session, lines.join("\n"), "system");
}

function handleStats(ctx: CommandContext): void {
  const s = ctx.session.state;
  const system = ctx.world.gameSystem;

  const lines = [`${s.name} - Level ${s.level} ${s.race} ${s.class}`];
  lines.push(`HP: ${s.currentHp}/${s.maxHp}  MP: ${s.currentMp}/${s.maxMp}  AP: ${s.currentAp}/${s.maxAp}`);
  lines.push("");
  lines.push("Attributes:");
  for (const [id, value] of Object.entries(s.attributes)) {
    const def = system.attributes[id];
    const name = def?.name ?? id;
    lines.push(`  ${name}: ${value}`);
  }

  sendNarrative(ctx.session, lines.join("\n"), "system");
}

export function sendNarrative(
  session: CharacterSession,
  text: string,
  style: "info" | "error" | "combat" | "system" | "chat" = "info"
): void {
  session.send(encodeMessage({ type: "narrative", text, style }));
}

export function sendRoomState(session: CharacterSession, ctx: CommandContext): void {
  const room = ctx.world.getRoom(session.currentRoom);
  if (!room) {
    sendNarrative(session, "You are in a void. Something went wrong.", "error");
    return;
  }
  session.send(encodeMessage({ type: "room_state", room: room.toState() }));
}
