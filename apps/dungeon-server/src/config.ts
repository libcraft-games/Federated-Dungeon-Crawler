export type BlueskyPostType = "chat" | "shout" | "emote" | "event" | "narrative" | "movement" | "combat" | "system";

export interface BlueskyConfig {
  enabled: boolean;
  identifier: string;
  password: string;
  service: string;
  postTypes: BlueskyPostType[];
  playerCrossPost: boolean;
  roomThreadRefreshMinutes: number;
  throttleMs: number;
}

export interface ServerConfig {
  name: string;
  description: string;
  port: number;
  host: string;
  tickRate: number;
  defaultSpawnRoom: string;
  dataPath: string;
  bluesky: BlueskyConfig;
}

export function loadConfig(): ServerConfig {
  return {
    name: process.env.SERVER_NAME ?? "Starter Dungeon",
    description: process.env.SERVER_DESCRIPTION ?? "A mysterious dungeon awaits...",
    port: parseInt(process.env.PORT ?? "3000", 10),
    host: process.env.HOST ?? "0.0.0.0",
    tickRate: parseInt(process.env.TICK_RATE ?? "250", 10),
    defaultSpawnRoom: process.env.DEFAULT_SPAWN ?? "starter-town:town-square",
    dataPath: process.env.DATA_PATH ?? decodeURIComponent(new URL("../data", import.meta.url).pathname),
    bluesky: {
      enabled: process.env.BSKY_ENABLED === "true",
      identifier: process.env.BSKY_IDENTIFIER ?? "",
      password: process.env.BSKY_PASSWORD ?? "",
      service: process.env.BSKY_SERVICE ?? "https://bsky.social",
      postTypes: parsePostTypes(process.env.BSKY_POST_TYPES ?? "chat,shout,event"),
      playerCrossPost: process.env.BSKY_PLAYER_CROSSPOST !== "false",
      roomThreadRefreshMinutes: parseInt(process.env.BSKY_THREAD_REFRESH ?? "60", 10),
      throttleMs: parseInt(process.env.BSKY_THROTTLE_MS ?? "2000", 10),
    },
  };
}

function parsePostTypes(str: string): BlueskyPostType[] {
  return str.split(",").map((s) => s.trim()).filter(Boolean) as BlueskyPostType[];
}
