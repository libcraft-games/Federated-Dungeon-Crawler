export interface ServerConfig {
  name: string;
  description: string;
  port: number;
  host: string;
  tickRate: number;
  defaultSpawnRoom: string;
  dataPath: string;
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
  };
}
