import type { ParsedCommand } from "@realms/common";
import type { CommandContext } from "./index.js";
import { sendNarrative, sendRoomState } from "./index.js";

export function handleLook(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session, world } = ctx;

  if (!cmd.target) {
    // Look at the room
    sendRoomState(session, ctx);
    return;
  }

  const room = world.getRoom(session.currentRoom);
  if (!room) return;

  const state = room.toState();

  // Look at a player
  const targetPlayer = state.players.find(
    (p) => p.name.toLowerCase() === cmd.target!.toLowerCase()
  );
  if (targetPlayer) {
    const targetSession = ctx.sessions.getSession(targetPlayer.id);
    if (targetSession) {
      const s = targetSession.state;
      sendNarrative(
        session,
        `${s.name} - Level ${s.level} ${s.race} ${s.class}\n${s.description ?? "You see nothing remarkable."}`,
        "info"
      );
      return;
    }
  }

  // Look at an NPC
  const targetNpc = state.npcs.find(
    (n) => n.name.toLowerCase() === cmd.target!.toLowerCase()
  );
  if (targetNpc) {
    sendNarrative(session, `You look at ${targetNpc.name}.`, "info");
    return;
  }

  // Look at an exit direction
  const exit = state.exits.find(
    (e) => e.direction === cmd.target!.toLowerCase()
  );
  if (exit) {
    sendNarrative(
      session,
      exit.description ?? `You see an exit leading ${exit.direction}.`,
      "info"
    );
    return;
  }

  sendNarrative(session, `You don't see '${cmd.target}' here.`, "error");
}
