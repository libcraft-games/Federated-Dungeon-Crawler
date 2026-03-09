import type { ParsedCommand } from "@realms/common";
import type { CommandContext } from "./index.js";
import { sendNarrative } from "./index.js";

export function handleCombat(cmd: ParsedCommand, ctx: CommandContext): void {
  const { session } = ctx;
  const combat = ctx.combat;

  if (!combat) {
    sendNarrative(session, "Combat system unavailable.", "error");
    return;
  }

  switch (cmd.verb) {
    case "attack":
    case "kill": {
      const target = cmd.args.join(" ") || undefined;
      combat.attack(session, target);
      break;
    }

    case "defend": {
      combat.defend(session);
      break;
    }

    case "flee":
    case "retreat": {
      combat.flee(session);
      break;
    }

    case "use": {
      const itemName = cmd.args.join(" ");
      if (!itemName) {
        sendNarrative(session, "Use what? Specify an item.", "error");
        return;
      }
      combat.useItem(session, itemName);
      break;
    }
  }
}
