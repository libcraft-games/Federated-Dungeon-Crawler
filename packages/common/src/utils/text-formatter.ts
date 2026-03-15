// ANSI color codes for terminal output
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
} as const;

export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

export function color(text: string, c: keyof typeof ANSI): string {
  return `${ANSI[c]}${text}${ANSI.reset}`;
}

export function roomTitle(title: string): string {
  return `${ANSI.bold}${ANSI.cyan}${title}${ANSI.reset}`;
}

export function exitList(directions: string[]): string {
  const exits = directions.map((d) => `${ANSI.yellow}${d}${ANSI.reset}`);
  return `[Exits: ${exits.join(", ")}]`;
}

export function narrative(text: string): string {
  return `${ANSI.white}${text}${ANSI.reset}`;
}

export function error(text: string): string {
  return `${ANSI.red}${text}${ANSI.reset}`;
}

export function system(text: string): string {
  return `${ANSI.dim}${ANSI.cyan}${text}${ANSI.reset}`;
}

export function playerName(name: string): string {
  return `${ANSI.bold}${ANSI.green}${name}${ANSI.reset}`;
}

export function npcName(name: string): string {
  return `${ANSI.bold}${ANSI.yellow}${name}${ANSI.reset}`;
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
