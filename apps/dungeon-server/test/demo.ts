#!/usr/bin/env bun
/**
 * Federated Realms — Interactive Demo
 *
 * Starts the server, connects a hero, and plays through an adventure
 * with full narrative output. Run with:
 *
 *   bun run test/demo.ts
 */

import { TestClient, startServer, stopServer } from "./helpers.ts";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function step(label: string) {
  console.log(`\n${BOLD}${CYAN}── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}${RESET}`);
}

function narrate(text: string) {
  for (const line of text.split("\n")) {
    console.log(`  ${GREEN}${line}${RESET}`);
  }
}

function room(title: string, desc: string, extras: string[] = []) {
  console.log(`\n  ${BOLD}${CYAN}${title}${RESET}`);
  console.log(`  ${DIM}${desc.slice(0, 120)}...${RESET}`);
  for (const e of extras) {
    console.log(`  ${YELLOW}${e}${RESET}`);
  }
}

function cmd(input: string) {
  console.log(`  ${DIM}> ${input}${RESET}`);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}⚔️  Federated Realms — Adventure Demo${RESET}\n`);
  console.log(`${DIM}Starting server...${RESET}`);

  const server = await startServer();
  console.log(`${DIM}Server running on port ${server.port}${RESET}`);

  const hero = new TestClient("Kaelith");

  try {
    await hero.connect(server.port, { classId: "rogue", raceId: "elf" });

    // ── Welcome ──
    step("Arriving in the Realm");
    const welcome = await hero.waitFor("welcome");
    console.log(`  Connected to ${BOLD}${welcome.serverName}${RESET}`);

    const spawn = await hero.waitFor("room_state");
    room(spawn.room.title, spawn.room.description, [
      `Items: ${spawn.room.items.map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`).join(", ") || "none"}`,
      `Exits: ${spawn.room.exits.map((e) => e.direction).join(", ")}`,
    ]);

    // ── Stats ──
    step("Checking Character Stats");
    cmd("stats");
    narrate(await hero.commandAndWait("stats"));

    // ── Blacksmith ──
    step("Visiting the Blacksmith");
    cmd("east");
    let r = await hero.commandAndWaitRoom("e");
    room(r.room.title, r.room.description, [
      `NPCs: ${r.room.npcs.map((n) => n.name).join(", ")}`,
      `Items: ${r.room.items.map((i) => i.name).join(", ")}`,
    ]);

    cmd("look grimjaw");
    narrate(await hero.commandAndWait("look grimjaw"));

    cmd("talk grimjaw");
    narrate(await hero.commandAndWait("talk grimjaw"));

    // ── Gear Up ──
    step("Picking Up Gear");
    cmd("take rusty sword");
    narrate(await hero.commandAndWait("take rusty sword"));
    await hero.waitFor("inventory_update");

    cmd("take wooden shield");
    narrate(await hero.commandAndWait("take wooden shield"));
    await hero.waitFor("inventory_update");

    cmd("examine rusty sword");
    narrate(await hero.commandAndWait("ex rusty sword"));

    cmd("inventory");
    narrate(await hero.commandAndWait("i"));

    // ── Tavern ──
    step("Stopping at the Tavern");
    cmd("west");
    await hero.commandAndWaitRoom("w");
    cmd("north");
    r = await hero.commandAndWaitRoom("n");
    room(r.room.title, r.room.description, [
      `NPCs: ${r.room.npcs.map((n) => n.name).join(", ")}`,
      `Items: ${r.room.items.map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`).join(", ")}`,
    ]);

    cmd("talk marta");
    narrate(await hero.commandAndWait("talk marta"));

    cmd("talk marta rumors");
    narrate(await hero.commandAndWait("talk marta rumors"));

    cmd("talk marta forest");
    narrate(await hero.commandAndWait("talk marta forest"));

    cmd("take bread");
    narrate(await hero.commandAndWait("take bread"));
    await hero.waitFor("inventory_update");

    // ── Journey South ──
    step("Heading to the Dark Forest");
    cmd("south → south → south");
    await hero.commandAndWaitRoom("s");
    await hero.commandAndWaitRoom("s");

    r = await hero.commandAndWaitRoom("s");
    room(r.room.title, r.room.description, [
      `Exits: ${r.room.exits.map((e) => e.direction).join(", ")}`,
    ]);

    // ── Dark Forest ──
    step("Entering the Dark Forest");
    cmd("east");
    r = await hero.commandAndWaitRoom("e");
    room(r.room.title, r.room.description, [
      `Items: ${r.room.items.map((i) => i.name).join(", ")}`,
    ]);

    cmd("take gnarled staff");
    narrate(await hero.commandAndWait("take staff"));
    await hero.waitFor("inventory_update");

    cmd("east");
    r = await hero.commandAndWaitRoom("e");
    room(r.room.title, r.room.description, [
      `NPCs: ${r.room.npcs.map((n) => n.name).join(", ")}`,
    ]);

    // ── Mushroom Grove ──
    step("Discovering the Mushroom Grove");
    cmd("north");
    r = await hero.commandAndWaitRoom("n");
    room(r.room.title, r.room.description, [
      `NPCs: ${r.room.npcs.map((n) => n.name).join(", ")}`,
      `Items: ${r.room.items.map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`).join(", ")}`,
      `Flags: ${r.room.flags.join(", ")}`,
    ]);

    cmd("look morel");
    narrate(await hero.commandAndWait("look morel"));

    cmd("talk morel");
    narrate(await hero.commandAndWait("talk morel"));

    cmd("talk morel mushrooms");
    narrate(await hero.commandAndWait("talk morel mushrooms"));

    cmd("take mushroom");
    narrate(await hero.commandAndWait("take mushroom"));
    await hero.waitFor("inventory_update");

    // ── Spider Hollow ──
    step("Venturing to Spider Hollow");
    cmd("south → east → east");
    await hero.commandAndWaitRoom("s");
    await hero.commandAndWaitRoom("e");

    r = await hero.commandAndWaitRoom("e");
    room(r.room.title, r.room.description, [
      `NPCs: ${r.room.npcs.map((n) => n.name).join(", ")}`,
      `Items: ${r.room.items.map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ""}`).join(", ")}`,
      `Flags: ${r.room.flags.join(", ")}`,
    ]);

    cmd("look spider");
    narrate(await hero.commandAndWait("look spider"));

    cmd("talk spider");
    narrate(await hero.commandAndWait("talk spider"));

    // ── Final Inventory ──
    step("Final Inventory Check");
    cmd("inventory");
    narrate(await hero.commandAndWait("i"));

    // ── Who ──
    step("Who's Online?");
    cmd("who");
    narrate(await hero.commandAndWait("who"));

    // ── Done ──
    step("Adventure Complete!");
    console.log(`  ${BOLD}${GREEN}Kaelith the elf rogue has explored the realm!${RESET}`);
    console.log(`  ${DIM}Visited: Town Square, Blacksmith, Tavern, Gate, Crossroads,`);
    console.log(`  Forest Edge, Forest Path, Mushroom Grove, Spider Hollow${RESET}`);

    hero.disconnect();
  } catch (err) {
    console.error(`\n${BOLD}\x1b[31mDemo failed:${RESET}`, err);
    hero.disconnect();
  } finally {
    stopServer(server.process);
    console.log(`\n${DIM}Server stopped.${RESET}\n`);
  }
}

main();
