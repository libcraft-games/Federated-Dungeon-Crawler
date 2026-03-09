import { describe, expect, test } from "bun:test";
import { encodeMessage, decodeClientMessage, decodeServerMessage } from "./messages.js";
import type { ClientMessage, ServerMessage } from "./messages.js";

describe("encodeMessage", () => {
  test("encodes client message to JSON", () => {
    const msg: ClientMessage = { type: "command", id: "1", command: "look", args: [] };
    const encoded = encodeMessage(msg);
    expect(JSON.parse(encoded)).toEqual(msg);
  });

  test("encodes server message to JSON", () => {
    const msg: ServerMessage = { type: "narrative", text: "Hello", style: "info" };
    const encoded = encodeMessage(msg);
    expect(JSON.parse(encoded)).toEqual(msg);
  });
});

describe("decodeClientMessage", () => {
  test("decodes valid command message", () => {
    const msg = decodeClientMessage('{"type":"command","id":"1","command":"look","args":[]}');
    expect(msg).toEqual({ type: "command", id: "1", command: "look", args: [] });
  });

  test("decodes move message", () => {
    const msg = decodeClientMessage('{"type":"move","id":"1","direction":"north"}');
    expect(msg?.type).toBe("move");
  });

  test("decodes chat message", () => {
    const msg = decodeClientMessage('{"type":"chat","channel":"room","message":"hello"}');
    expect(msg?.type).toBe("chat");
  });

  test("returns null for invalid JSON", () => {
    expect(decodeClientMessage("not json")).toBeNull();
  });

  test("returns null for non-object", () => {
    expect(decodeClientMessage('"just a string"')).toBeNull();
    expect(decodeClientMessage("42")).toBeNull();
  });

  test("returns null for missing type", () => {
    expect(decodeClientMessage('{"command":"look"}')).toBeNull();
  });
});

describe("decodeServerMessage", () => {
  test("decodes welcome message", () => {
    const msg = decodeServerMessage('{"type":"welcome","sessionId":"abc","serverName":"Test"}');
    expect(msg?.type).toBe("welcome");
    if (msg?.type === "welcome") {
      expect(msg.sessionId).toBe("abc");
      expect(msg.serverName).toBe("Test");
    }
  });

  test("decodes narrative message", () => {
    const msg = decodeServerMessage('{"type":"narrative","text":"Hello","style":"info"}');
    expect(msg?.type).toBe("narrative");
    if (msg?.type === "narrative") {
      expect(msg.text).toBe("Hello");
    }
  });

  test("returns null for invalid JSON", () => {
    expect(decodeServerMessage("broken")).toBeNull();
  });
});
