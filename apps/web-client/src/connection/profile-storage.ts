import type { SavedProfile } from "@realms/client-common";
export type { SavedProfile } from "@realms/client-common";

const STORAGE_KEY = "federated-realms-profile";

export function loadProfile(): SavedProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: SavedProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
