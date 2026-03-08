import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";
import { TestClient, startServer, stopServer } from "./helpers.ts";

let port: number;
let serverProc: Subprocess;

beforeAll(async () => {
  const server = await startServer();
  port = server.port;
  serverProc = server.process;
});

afterAll(() => {
  stopServer(serverProc);
});

// ─── Connection ──────────────────────────────────────────────

describe("connection", () => {
  test("receives welcome message on connect", async () => {
    const client = new TestClient("WelcomeTest");
    await client.connect(port);
    const welcome = await client.waitFor("welcome");
    expect(welcome.serverName).toBe("Starter Dungeon");
    expect(welcome.sessionId).toBeTruthy();
    client.disconnect();
  });

  test("receives initial room state on connect", async () => {
    const client = new TestClient("RoomTest");
    await client.connect(port);
    const room = await client.waitFor("room_state");
    expect(room.room.title).toBe("Town Square");
    expect(room.room.exits.length).toBeGreaterThan(0);
    client.disconnect();
  });

  test("server health endpoint responds", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.server).toBe("Starter Dungeon");
  });

  test("server info endpoint responds", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/info`);
    const data = await res.json();
    expect(data.rooms).toBe(16);
  });

  test("server system endpoint returns game system", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/system`);
    const data = await res.json();
    expect(data.attributes).toBeDefined();
    expect(data.classes).toBeDefined();
    expect(data.formulas).toBeDefined();
  });
});

// ─── Movement ────────────────────────────────────────────────

describe("movement", () => {
  test("move north to tavern", async () => {
    const client = new TestClient("Mover");
    await client.connect(port);
    await client.waitFor("room_state"); // initial room

    const room = await client.commandAndWaitRoom("n");
    expect(room.room.title).toBe("The Rusty Tankard");
    client.disconnect();
  });

  test("move east to blacksmith", async () => {
    const client = new TestClient("Smith");
    await client.connect(port);
    await client.waitFor("room_state");

    const room = await client.commandAndWaitRoom("e");
    expect(room.room.title).toBe("Ironheart's Forge");
    client.disconnect();
  });

  test("cannot move in invalid direction", async () => {
    const client = new TestClient("Stuck");
    await client.connect(port);
    await client.waitFor("room_state");

    // Town square has no northeast exit
    const text = await client.commandAndWait("ne");
    expect(text).toContain("no exit");
    client.disconnect();
  });

  test("full path: town -> gate -> crossroads -> dark forest", async () => {
    const client = new TestClient("Explorer");
    await client.connect(port);
    await client.waitFor("room_state");

    let room = await client.commandAndWaitRoom("s");
    expect(room.room.title).toBe("Southern Gate");

    room = await client.commandAndWaitRoom("s");
    expect(room.room.title).toBe("The Crossroads");

    room = await client.commandAndWaitRoom("e");
    expect(room.room.title).toBe("Edge of the Dark Forest");

    room = await client.commandAndWaitRoom("e");
    expect(room.room.title).toBe("Winding Forest Path");

    client.disconnect();
  });
});

// ─── Look ────────────────────────────────────────────────────

describe("look", () => {
  test("look shows room description", async () => {
    const client = new TestClient("Looker");
    await client.connect(port);
    await client.waitFor("room_state");

    const room = await client.commandAndWaitRoom("look");
    expect(room.room.title).toBe("Town Square");
    expect(room.room.description).toContain("fountain");
    client.disconnect();
  });

  test("look at exit shows exit description", async () => {
    const client = new TestClient("ExitLook");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("look north");
    expect(text).toContain("Rusty Tankard");
    client.disconnect();
  });

  test("look at nonexistent target shows error", async () => {
    const client = new TestClient("LookFail");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("look dragon");
    expect(text).toContain("don't see");
    client.disconnect();
  });
});

// ─── Items ───────────────────────────────────────────────────

describe("items", () => {
  test("town square has torches on the ground", async () => {
    const client = new TestClient("ItemCheck");
    await client.connect(port);
    const room = await client.waitFor("room_state");
    const torch = room.room.items.find((i) => i.name === "Torch");
    expect(torch).toBeDefined();
    expect(torch!.quantity).toBe(2);
    client.disconnect();
  });

  test("take an item", async () => {
    const client = new TestClient("Taker");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("take torch");
    expect(text).toContain("pick up");
    expect(text).toContain("Torch");

    // Should receive inventory_update
    const inv = await client.waitFor("inventory_update");
    expect(inv.inventory.length).toBe(1);
    expect(inv.inventory[0].name).toBe("Torch");
    client.disconnect();
  });

  test("inventory shows carried items", async () => {
    const client = new TestClient("InvCheck");
    await client.connect(port);
    await client.waitFor("room_state");

    // Take something first
    await client.commandAndWait("take torch");
    await client.waitFor("inventory_update");
    client.clearMessages();

    const text = await client.commandAndWait("i");
    expect(text).toContain("Torch");
    client.disconnect();
  });

  test("drop an item", async () => {
    const client = new TestClient("Dropper");
    await client.connect(port);
    await client.waitFor("room_state");

    // Go to blacksmith and take leather cap
    await client.commandAndWaitRoom("e");
    client.command("take leather cap");
    await client.tick(300);
    client.clearMessages();

    // Drop it
    const text = await client.commandAndWait("drop leather cap");
    expect(text).toContain("drop");
    expect(text).toContain("Leather Cap");
    client.disconnect();
  });

  test("examine an item shows details", async () => {
    const client = new TestClient("Examiner");
    await client.connect(port);
    await client.waitFor("room_state");

    // Go to blacksmith for items with properties
    await client.commandAndWaitRoom("e");
    client.clearMessages();

    const text = await client.commandAndWait("examine rusty sword");
    expect(text).toContain("Rusty Sword");
    expect(text).toContain("weapon");
    expect(text).toContain("common");
    client.disconnect();
  });

  test("cannot take item that doesn't exist", async () => {
    const client = new TestClient("TakeFail");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("take excalibur");
    expect(text).toContain("don't see");
    client.disconnect();
  });
});

// ─── NPCs ────────────────────────────────────────────────────

describe("NPCs", () => {
  test("tavern has Marta the Barkeep", async () => {
    const client = new TestClient("NpcFinder");
    await client.connect(port);
    await client.waitFor("room_state");

    const room = await client.commandAndWaitRoom("n");
    const marta = room.room.npcs.find((n) => n.name.includes("Marta"));
    expect(marta).toBeDefined();
    client.disconnect();
  });

  test("look at NPC shows description", async () => {
    const client = new TestClient("NpcLooker");
    await client.connect(port);
    await client.waitFor("room_state");
    await client.commandAndWaitRoom("n"); // tavern
    client.clearMessages();

    const text = await client.commandAndWait("look marta");
    expect(text).toContain("Marta the Barkeep");
    expect(text).toContain("stout woman");
    expect(text).toContain("Level: 5");
    client.disconnect();
  });

  test("talk to NPC shows greeting dialogue", async () => {
    const client = new TestClient("Talker");
    await client.connect(port);
    await client.waitFor("room_state");
    await client.commandAndWaitRoom("n"); // tavern
    client.clearMessages();

    const text = await client.commandAndWait("talk marta");
    expect(text).toContain("Marta the Barkeep says:");
    expect(text).toContain("Welcome to The Rusty Tankard");
    expect(text).toContain("You could respond:");
    client.disconnect();
  });

  test("navigate dialogue tree", async () => {
    const client = new TestClient("DialogueNav");
    await client.connect(port);
    await client.waitFor("room_state");
    await client.commandAndWaitRoom("n"); // tavern
    client.clearMessages();

    const text = await client.commandAndWait("talk marta rumors");
    expect(text).toContain("strange lights");
    expect(text).toContain("Dark Forest");
    client.disconnect();
  });

  test("hostile NPC refuses dialogue", async () => {
    const client = new TestClient("HostileTalk");
    await client.connect(port);
    await client.waitFor("room_state");

    // Navigate to spider hollow
    await client.commandAndWaitRoom("s");     // gate
    await client.commandAndWaitRoom("s");     // crossroads
    await client.commandAndWaitRoom("e");     // forest edge
    await client.commandAndWaitRoom("e");     // forest path
    await client.commandAndWaitRoom("e");     // deep forest
    await client.commandAndWaitRoom("e");     // spider hollow
    client.clearMessages();

    const text = await client.commandAndWait("talk spider");
    expect(text).toContain("doesn't seem interested");
    client.disconnect();
  });
});

// ─── Chat ────────────────────────────────────────────────────

describe("chat", () => {
  test("say broadcasts to room", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");
    await alice.connect(port);
    await bob.connect(port);
    await alice.waitFor("room_state");
    await bob.waitFor("room_state");
    bob.clearMessages();

    alice.command("say Hello everyone!");
    const chat = await bob.waitFor("chat");
    expect(chat.sender).toBe("Alice");
    expect(chat.message).toBe("Hello everyone!");
    expect(chat.channel).toBe("room");

    alice.disconnect();
    bob.disconnect();
  });

  test("shout reaches players in different rooms", async () => {
    const alice = new TestClient("AliceShout");
    const bob = new TestClient("BobShout");
    await alice.connect(port);
    await bob.connect(port);
    await alice.waitFor("room_state");
    await bob.waitFor("room_state");

    // Move Bob to tavern
    await bob.commandAndWaitRoom("n");
    bob.clearMessages();

    alice.command("shout Help!");
    const chat = await bob.waitFor("chat");
    expect(chat.sender).toBe("AliceShout");
    expect(chat.message).toBe("Help!");
    expect(chat.channel).toBe("shout");

    alice.disconnect();
    bob.disconnect();
  });

  test("whisper is private", async () => {
    const alice = new TestClient("AliceW");
    const bob = new TestClient("BobW");
    const carol = new TestClient("CarolW");
    await alice.connect(port);
    await bob.connect(port);
    await carol.connect(port);
    await alice.waitFor("room_state");
    await bob.waitFor("room_state");
    await carol.waitFor("room_state");
    carol.clearMessages();

    alice.command("whisper BobW secret message");
    const whisper = await bob.waitFor("chat");
    expect(whisper.channel).toBe("whisper");
    expect(whisper.message).toBe("secret message");

    // Carol should NOT receive it — wait briefly and check
    await carol.tick(300);
    const carolChats = carol.getMessagesOfType("chat");
    expect(carolChats.length).toBe(0);

    alice.disconnect();
    bob.disconnect();
    carol.disconnect();
  });
});

// ─── Info Commands ───────────────────────────────────────────

describe("info commands", () => {
  test("stats shows character info", async () => {
    const client = new TestClient("StatCheck");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("stats");
    expect(text).toContain("StatCheck");
    expect(text).toContain("Level 1");
    expect(text).toContain("warrior");
    expect(text).toContain("HP:");
    expect(text).toContain("Attributes:");
    client.disconnect();
  });

  test("who shows online players", async () => {
    const client = new TestClient("WhoCheck");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("who");
    expect(text).toContain("WhoCheck");
    expect(text).toContain("Town Square");
    client.disconnect();
  });

  test("help shows command list", async () => {
    const client = new TestClient("HelpCheck");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("help");
    expect(text).toContain("Movement:");
    expect(text).toContain("Items:");
    expect(text).toContain("NPCs:");
    expect(text).toContain("Social:");
    client.disconnect();
  });

  test("unknown command shows error", async () => {
    const client = new TestClient("BadCmd");
    await client.connect(port);
    await client.waitFor("room_state");

    const text = await client.commandAndWait("dance");
    expect(text).toContain("Unknown command");
    client.disconnect();
  });
});

// ─── Multiplayer ─────────────────────────────────────────────

describe("multiplayer", () => {
  test("players see each other enter rooms", async () => {
    const alice = new TestClient("AliceMP");
    const bob = new TestClient("BobMP");
    await alice.connect(port);
    await bob.connect(port);
    await alice.waitFor("room_state");
    await bob.waitFor("room_state");

    // Move Alice north — Bob should see her leave
    bob.clearMessages();
    alice.command("n");

    const leave = await bob.waitFor("entity_leave");
    expect(leave.entity.name).toBe("AliceMP");

    alice.disconnect();
    bob.disconnect();
  });

  test("who command shows multiple players", async () => {
    const alice = new TestClient("AliceWho");
    const bob = new TestClient("BobWho");
    await alice.connect(port);
    await bob.connect(port);
    await alice.waitFor("room_state");
    await bob.waitFor("room_state");
    alice.clearMessages();

    const text = await alice.commandAndWait("who");
    expect(text).toContain("AliceWho");
    expect(text).toContain("BobWho");

    alice.disconnect();
    bob.disconnect();
  });
});

// ─── Full Adventure (Demo Scenario) ─────────────────────────

describe("full adventure walkthrough", () => {
  test("a hero explores the world, gears up, and ventures into the forest", async () => {
    const hero = new TestClient("Kaelith");
    await hero.connect(port, { classId: "rogue", raceId: "elf" });

    // 1. Arrive in town square
    const welcome = await hero.waitFor("welcome");
    expect(welcome.serverName).toBe("Starter Dungeon");

    const spawn = await hero.waitFor("room_state");
    expect(spawn.room.title).toBe("Town Square");

    // 2. Check stats
    let text = await hero.commandAndWait("stats");
    expect(text).toContain("Kaelith");
    expect(text).toContain("elf");
    expect(text).toContain("rogue");

    // 3. Visit the blacksmith
    let room = await hero.commandAndWaitRoom("e");
    expect(room.room.title).toBe("Ironheart's Forge");
    expect(room.room.npcs.some((n) => n.name.includes("Grimjaw"))).toBe(true);

    // 4. Talk to Grimjaw
    text = await hero.commandAndWait("talk grimjaw");
    expect(text).toContain("blades, shields, and armor");

    // 5. Pick up gear
    text = await hero.commandAndWait("take rusty sword");
    expect(text).toContain("pick up");
    await hero.waitFor("inventory_update");

    text = await hero.commandAndWait("take wooden shield");
    expect(text).toContain("pick up");
    await hero.waitFor("inventory_update");

    // 6. Check inventory
    text = await hero.commandAndWait("i");
    expect(text).toContain("Rusty Sword");
    expect(text).toContain("Wooden Shield");

    // 7. Examine the sword
    text = await hero.commandAndWait("ex rusty sword");
    expect(text).toContain("weapon");
    expect(text).toContain("melee");

    // 8. Head back and visit the tavern
    room = await hero.commandAndWaitRoom("w");
    expect(room.room.title).toBe("Town Square");

    room = await hero.commandAndWaitRoom("n");
    expect(room.room.title).toBe("The Rusty Tankard");

    // 9. Talk to Marta about rumors
    text = await hero.commandAndWait("talk marta rumors");
    expect(text).toContain("Dark Forest");
    expect(text).toContain("Grimjaw");

    // 10. Grab some bread for the journey
    text = await hero.commandAndWait("take bread");
    expect(text).toContain("pick up");
    await hero.waitFor("inventory_update");

    // 11. Head south through town to the crossroads
    room = await hero.commandAndWaitRoom("s"); // back to square
    room = await hero.commandAndWaitRoom("s"); // gate
    expect(room.room.npcs.some((n) => n.name.includes("Guard"))).toBe(true);

    room = await hero.commandAndWaitRoom("s"); // crossroads
    expect(room.room.title).toBe("The Crossroads");

    // 12. Enter the Dark Forest
    room = await hero.commandAndWaitRoom("e"); // forest edge
    expect(room.room.title).toBe("Edge of the Dark Forest");
    expect(room.room.items.some((i) => i.name.includes("Staff"))).toBe(true);

    // 13. Take the gnarled staff
    text = await hero.commandAndWait("take staff");
    expect(text).toContain("Gnarled Staff");
    await hero.waitFor("inventory_update");

    // 14. Push deeper into the forest
    room = await hero.commandAndWaitRoom("e"); // forest path
    expect(room.room.npcs.some((n) => n.name.includes("Wolf"))).toBe(true);

    // 15. Visit the mushroom grove
    room = await hero.commandAndWaitRoom("n"); // mushroom grove
    expect(room.room.title).toBe("Luminous Mushroom Grove");
    expect(room.room.flags).toContain("safe");

    // 16. Talk to Old Morel
    text = await hero.commandAndWait("talk morel");
    expect(text).toContain("mushrooms");

    text = await hero.commandAndWait("talk morel mushrooms");
    expect(text).toContain("Luminaris caps");
    expect(text).toContain("healing");

    // 17. Gather mushrooms
    text = await hero.commandAndWait("take mushroom");
    expect(text).toContain("Glowing Mushroom");
    await hero.waitFor("inventory_update");

    // 18. Final inventory check
    text = await hero.commandAndWait("i");
    expect(text).toContain("Rusty Sword");
    expect(text).toContain("Wooden Shield");
    expect(text).toContain("Loaf of Bread");
    expect(text).toContain("Gnarled Staff");
    expect(text).toContain("Glowing Mushroom");

    // 19. Help command works everywhere
    text = await hero.commandAndWait("help");
    expect(text).toContain("Movement:");

    hero.disconnect();
  });
});
