import React from "react";
import { render } from "ink";
import { App } from "./components/App.js";

// Parse CLI arguments
const args = process.argv.slice(2);
const flags: Record<string, string> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    flags[key] = args[i + 1] ?? "";
    i++;
  } else {
    positional.push(args[i]);
  }
}

const host = flags.host ?? "localhost";
const tls = "tls" in flags || "ssl" in flags || host !== "localhost";
const port = parseInt(flags.port ?? (tls ? "443" : "3333"), 10);
const name = flags.name ?? positional[0] ?? `Adventurer_${Math.floor(Math.random() * 9999)}`;

// Only skip character creation if class was explicitly provided
const classExplicit = "class" in flags;
const raceExplicit = "race" in flags;
const skipCreate = classExplicit;

const classId = flags.class;
const raceId = flags.race;

const protocol = tls ? "wss" : "ws";
const defaultPort = tls ? 443 : 80;
const portDisplay = port === defaultPort ? "" : `:${port}`;

// Clear terminal for fullscreen layout
process.stdout.write("\x1b[2J\x1b[H");

render(
  <App
    host={host}
    port={port}
    tls={tls}
    name={name}
    classId={classId}
    raceId={raceId}
    skipCreate={skipCreate}
  />
);
