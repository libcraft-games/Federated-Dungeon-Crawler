import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";
import { TestClient, startServer, stopServer } from "../helpers.ts";

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

// ─── Portals ─────────────────────────────────────────────────

describe("portals", () => {
  test("portal chamber room is reachable", async () => {
    const client = new TestClient("PortalExplorer");
    await client.connect(port);
    await client.waitFor("room_state");

    // Town Square -> South Gate -> Crossroads -> Old Road -> Portal Chamber
    await client.commandAndWaitRoom("s"); // gate
    await client.commandAndWaitRoom("s"); // crossroads
    await client.commandAndWaitRoom("w"); // old road
    const room = await client.commandAndWaitRoom("w"); // portal chamber

    expect(room.room.title).toBe("The Portal Chamber");
    expect(room.room.description).toContain("portal");
    expect(room.room.description).toContain("Federated Realms");
    expect(room.room.flags).toContain("safe");
    client.disconnect();
  });

  test("portal chamber has exit back to old road", async () => {
    const client = new TestClient("PortalExit");
    await client.connect(port);
    await client.waitFor("room_state");

    await client.commandAndWaitRoom("s");
    await client.commandAndWaitRoom("s");
    await client.commandAndWaitRoom("w");
    const room = await client.commandAndWaitRoom("w");

    const eastExit = room.room.exits.find((e: { direction: string }) => e.direction === "east");
    expect(eastExit).toBeDefined();

    // Go back east
    const back = await client.commandAndWaitRoom("e");
    expect(back.room.title).toBe("The Old Road");
    client.disconnect();
  });
});
