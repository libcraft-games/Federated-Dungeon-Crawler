// Connection
export { WsClient } from "./connection/ws-client.js";
export type {
  MessageHandler,
  ConnectionOptions,
  SessionConnectionOptions,
} from "./connection/ws-client.js";
export type { SavedProfile } from "./connection/profile.js";

// Hooks
export { useGameState } from "./hooks/use-game-state.js";
export type {
  GameState,
  CharacterStats,
  NarrativeLine,
  QuestEntry,
  QuestObjectiveEntry,
  CombatState,
  PortalOfferState,
  MapState,
  EquipmentMap,
} from "./hooks/use-game-state.js";

// Utilities
export { SLOT_LABELS, hpLevel, viewportMap } from "./utils/game-ui.js";
export type { HpLevel } from "./utils/game-ui.js";

// Branding
export { SPLASH_ART, SPLASH_TITLE, SPLASH_SUBTITLE } from "./splash.js";
