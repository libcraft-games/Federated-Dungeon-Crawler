import type { ParsedCommand } from "@realms/common";
import { encodeMessage } from "@realms/protocol";
import type { CommandContext } from "./index.js";
import { sendNarrative } from "./index.js";

export function handleSocial(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session, broadcast, sessions, bluesky } = ctx;

  switch (cmd.verb) {
    case "say": {
      const message = cmd.args.join(" ");
      if (!message) {
        sendNarrative(session, "Say what?", "error");
        return;
      }
      broadcast(session.currentRoom, {
        type: "chat",
        channel: "room",
        sender: session.name,
        message,
      });

      // Post to Bluesky
      const room = ctx.world.getRoom(session.currentRoom);
      bluesky.post({
        type: "chat",
        roomId: session.currentRoom,
        roomTitle: room?.title ?? session.currentRoom,
        playerName: session.name,
        playerDid: session.characterDid,
        text: message,
      });
      break;
    }

    case "shout": {
      const message = cmd.args.join(" ");
      if (!message) {
        sendNarrative(session, "Shout what?", "error");
        return;
      }
      // Shout goes to all connected players
      for (const s of sessions.getAllSessions()) {
        s.send(
          encodeMessage({
            type: "chat",
            channel: "shout",
            sender: session.name,
            message,
          }),
        );
      }

      // Post to Bluesky
      const room = ctx.world.getRoom(session.currentRoom);
      bluesky.post({
        type: "shout",
        roomId: session.currentRoom,
        roomTitle: room?.title ?? session.currentRoom,
        playerName: session.name,
        playerDid: session.characterDid,
        text: message,
      });
      break;
    }

    case "whisper": {
      if (cmd.args.length < 2) {
        sendNarrative(session, "Whisper to whom? Usage: whisper <player> <message>", "error");
        return;
      }
      const targetName = cmd.args[0];
      const message = cmd.args.slice(1).join(" ");
      const target = sessions.findByName(targetName);
      if (!target) {
        sendNarrative(session, `Player '${targetName}' is not online.`, "error");
        return;
      }
      target.send(
        encodeMessage({
          type: "chat",
          channel: "whisper",
          sender: session.name,
          message,
        }),
      );
      sendNarrative(session, `You whisper to ${target.name}: ${message}`, "chat");
      // Whispers are private — never posted to Bluesky
      break;
    }
  }
}
