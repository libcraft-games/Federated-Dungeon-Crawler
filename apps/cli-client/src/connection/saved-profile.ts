import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SavedProfile } from "@realms/client-common";
export type { SavedProfile } from "@realms/client-common";

const PROFILE_DIR = join(homedir(), ".federated-realms");
const PROFILE_PATH = join(PROFILE_DIR, "profile.json");

export function loadProfile(): SavedProfile | null {
  try {
    if (!existsSync(PROFILE_PATH)) return null;
    const raw = readFileSync(PROFILE_PATH, "utf-8");
    return JSON.parse(raw) as SavedProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: SavedProfile): void {
  if (!existsSync(PROFILE_DIR)) {
    mkdirSync(PROFILE_DIR, { recursive: true });
  }
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

export function clearProfile(): void {
  try {
    if (existsSync(PROFILE_PATH)) {
      writeFileSync(PROFILE_PATH, "{}");
    }
  } catch {
    // ignore
  }
}
