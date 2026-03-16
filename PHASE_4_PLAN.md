# Phase 4 Plan: Quests, Crafting & Economy

**Status:** In Progress
**Gold & Merchants:** Complete (pulled into Phase 3)
**Remaining:** Quest system, Crafting system, CLI UI for both

---

## Overview

Phase 4 adds the content loop that keeps players engaged beyond combat:
- **Quests** give NPCs purpose, reward exploration, and drive narrative
- **Crafting** gives loot drops meaning and rewards gathering
- The two systems connect: quests can require crafted items; crafting can be a quest objective

---

## Part 1: Quest System

### 1.1 Quest Definitions (YAML)

Add `quests.yml` files per area alongside `npcs.yml`. Each quest definition maps to the `com.cacheblasters.fm.quest.definition` lexicon.

**Example: `data/areas/starter-town/quests.yml`**

```yaml
quests:
  - id: wolf-problem
    name: "The Wolf Problem"
    description: "Farmer Aldric's sheep have been going missing. He suspects the grey wolves in the Dark Forest."
    level: 1
    giver: starter-town/old-aldric
    objectives:
      - type: kill
        description: "Kill grey wolves"
        target: dark-forest/grey-wolf
        count: 3
      - type: talk
        description: "Report back to Aldric"
        target: starter-town/old-aldric
    rewards:
      xp: 150
      gold: 25
      items:
        - starter-town/health-potion

  - id: potion-delivery
    name: "Elara's Delivery"
    description: "Alchemist Elara needs a health potion delivered to the barkeep Marta."
    level: 1
    giver: starter-town/elara-alchemist
    turnIn: starter-town/barkeep-marta
    objectives:
      - type: collect
        description: "Get a health potion"
        target: starter-town/health-potion
        count: 1
      - type: deliver
        description: "Deliver it to Marta"
        target: starter-town/barkeep-marta
    rewards:
      xp: 80
      gold: 15
```

**Notes:**
- Quest IDs are prefixed per-area on load (e.g. `starter-town/wolf-problem`), same pattern as item/NPC IDs.
- `giver` and `turnIn` reference NPC definition IDs (area-prefixed).
- `objectives` are ordered; later objectives only unlock after prior ones complete.
- `target` semantics depend on `type`: kill → NPC def ID, collect/deliver → item def ID, talk/visit → NPC def ID or room ID.

---

### 1.2 Data Layer

#### `QuestManager` (new: `apps/dungeon-server/src/systems/quest-manager.ts`)

Owns all quest definitions and per-player active quest state.

```typescript
class QuestManager {
  // Quest definitions loaded from YAML
  private definitions: Map<string, QuestDefinition>

  // Per-player active quest state: playerDid → questId → QuestProgress
  private activeQuests: Map<string, Map<string, QuestProgress>>

  // Load all quest definitions (called by AreaManager)
  registerDefinition(id: string, def: QuestDefinition): void

  // Query
  getDefinition(id: string): QuestDefinition | undefined
  getActiveQuests(playerDid: string): QuestProgress[]
  getQuestProgress(playerDid: string, questId: string): QuestProgress | undefined

  // Available quests for an NPC in a given session context
  getAvailableQuests(playerDid: string, giverNpcId: string, playerLevel: number): QuestDefinition[]
  getCompletableQuests(playerDid: string, turnInNpcId: string): QuestDefinition[]

  // Mutations
  acceptQuest(playerDid: string, questId: string): QuestProgress
  recordKill(playerDid: string, npcDefinitionId: string): string[] // returns questIds updated
  recordCollect(playerDid: string, itemDefinitionId: string, count: number): string[]
  recordTalk(playerDid: string, npcDefinitionId: string): string[]
  recordVisit(playerDid: string, roomId: string): string[]
  recordDeliver(playerDid: string, npcDefinitionId: string, itemDefinitionId: string): string[]
  completeQuest(playerDid: string, questId: string, session: CharacterSession): QuestDefinition
  abandonQuest(playerDid: string, questId: string): void

  // Check if prerequisites are met
  private prerequisitesMet(playerDid: string, questDef: QuestDefinition): boolean
}
```

**ActiveQuestState shape** (matches `QuestProgress` from lexicon):
```typescript
{
  questId: string,
  serverId: string,
  status: "active" | "completed" | "failed",
  objectives: { current: number, required: number, done: boolean }[],
  acceptedAt: string,
  completedAt?: string
}
```

#### `WorldContext` (update: `apps/dungeon-server/src/world/world-context.ts`)
Add `questManager: QuestManager` alongside `npcManager`.

#### `AreaManager` (update: `apps/dungeon-server/src/world/area-manager.ts`)
- Load `quests.yml` per area during `loadArea()`
- Prefix quest IDs with area ID (same pattern as items/NPCs)
- Register with `world.questManager.registerDefinition()`

---

### 1.3 Objective Tracking Hooks

Hooks plug into existing systems to automatically track quest progress on events.

#### Kill tracking (update: `combat-system.ts → handleNpcDeath`)
```typescript
private handleNpcDeath(session: CharacterSession, npc: NpcInstance): void {
  // ... existing loot/xp code ...

  // Quest kill tracking
  const updated = this.ctx.world.questManager.recordKill(session.did, npc.definitionId);
  if (updated.length > 0) {
    sendQuestUpdates(session, this.ctx.world.questManager, updated);
  }
}
```

#### Collect tracking (update: `inventory.ts → handleTake`)
When a player picks up an item, record the collect event:
```typescript
const updated = questManager.recordCollect(session.did, item.definitionId, item.quantity);
if (updated.length > 0) sendQuestUpdates(session, questManager, updated);
```

#### Talk tracking (update: `interaction.ts → handleTalk`)
After successful NPC dialogue, record the talk event:
```typescript
const updated = questManager.recordTalk(session.did, npc.definitionId);
```

#### Visit tracking (update: `interaction.ts → handleLook` or movement)
When a player enters a room:
```typescript
const updated = questManager.recordVisit(session.did, session.currentRoom);
```

#### Deliver tracking (update: `commands/quest.ts → handleTurnIn`)
When a player turns in a quest that requires delivery, check if they have the item in inventory.

---

### 1.4 Quest Commands (`apps/dungeon-server/src/commands/quest.ts`)

New command file handling: `quests`, `quest`, `accept`, `abandon`, `turnin`

```
quests              — list available quests from NPC (if talking to one) or active quests
quest log           — show your active quests and objectives
quest <name>        — show details on a specific quest
accept <quest>      — accept a quest from the current questgiver NPC
abandon <quest>     — abandon an active quest
turnin              — turn in a completed quest to the current NPC
```

**`quests` (no NPC context):** Show the player's active quest log with objective progress.

**`quests` (near questgiver NPC):** Show quests that NPC offers (level-filtered, prerequisites checked).

**`accept <quest name>`:**
1. Find questgiver NPC in room with `behavior: "questgiver"`
2. Verify quest is available (level, prerequisites, not already active/completed)
3. `questManager.acceptQuest(did, questId)` → creates `QuestProgress`
4. Send `quest_update` message to client
5. Narrative: `"You accept the quest: {name}. {firstObjective.description}"`

**`turnin`:**
1. Find turn-in NPC in room
2. `questManager.getCompletableQuests(did, npcId)` — quests where all objectives are done
3. If none: `"You have no completed quests for {npcName}."`
4. Otherwise: grant rewards (XP, gold, items), mark complete, send updates

**`quest log`:**
```
=== Quest Log ===
[1] The Wolf Problem (active)
    > Kill grey wolves (2/3)
    > Report back to Aldric (0/1) [locked]

[2] Elara's Delivery (active)
    > Get a health potion (1/1) ✓
    > Deliver it to Marta (0/1)
```

Register in `commands/index.ts`:
```typescript
case "quest":
case "quests":
case "log":
  handleQuest(cmd, ctx); break;
case "accept":
  handleAcceptQuest(cmd, ctx); break;
case "abandon":
  handleAbandonQuest(cmd, ctx); break;
case "turnin":
case "turn-in":
  handleTurnIn(cmd, ctx); break;
```

Also add to combat allowlist: `"quest"`, `"quests"`, `"log"` (read-only, safe during combat).

---

### 1.5 NPC Questgiver Integration

#### NPC YAML additions

NPCs with `behavior: questgiver` may optionally list `quests` (array of quest IDs defined in the same area's `quests.yml`). The YAML for an NPC stays the same — the questgiver link is purely through the quest's `giver` field pointing at the NPC definition ID.

Questgivers can also have `behavior: questgiver` while being capable of `talk` dialogue. The `talk` command should show different prompts when:
- The NPC has quests available for the player → hint: `"(type 'quests' to see what {name} needs)"`
- The player has a completable quest with this NPC → hint: `"(type 'turnin' to complete your quest)"`

Update `handleTalk` in `interaction.ts` to check and append quest hints to dialogue.

---

### 1.6 Protocol Messages (update: `packages/protocol/src/messages.ts`)

Add to the `ServerMessage` union:

```typescript
// Sent when quest progress changes (objective advance, acceptance, completion)
| {
    type: "quest_update";
    questId: string;
    questName: string;
    status: "active" | "completed" | "failed";
    objectives: { description: string; current: number; required: number; done: boolean }[];
    // Present only on completion
    rewards?: { xp?: number; gold?: number; items?: string[] };
  }

// Full quest log refresh (sent on connect and on request)
| {
    type: "quest_log";
    quests: Array<{
      questId: string;
      questName: string;
      status: "active" | "completed" | "failed";
      objectives: { description: string; current: number; required: number; done: boolean }[];
    }>;
  }
```

Send `quest_log` on player connect (alongside `inventory_update`, `character_update`, etc. in `apps/dungeon-server/src/index.ts`).

---

### 1.7 Quest Persistence (AT Proto PDS)

Quest progress is written to the player's PDS as `com.cacheblasters.fm.quest.progress` records. This is what makes quests truly federated — progress is owned by the player, not the server.

#### Write flow
After any quest state change, write a PDS record:
```typescript
async function persistQuestProgress(
  agent: AtpAgent,
  playerDid: string,
  progress: QuestProgress
): Promise<void> {
  await agent.com.atproto.repo.putRecord({
    repo: playerDid,
    collection: NSID.QuestProgress,
    rkey: slugify(progress.questId), // e.g. "wolf-problem"
    record: progress,
  });
}
```

#### Read flow (on login / reconnect)
When a player connects, load their existing quest progress from PDS to warm the `QuestManager`:
```typescript
async function loadQuestProgressFromPds(agent, playerDid): Promise<QuestProgress[]>
```

#### Implementation notes
- PDS writes are async and fire-and-forget (don't block gameplay)
- Use the AT Proto agent already established during login
- Records use `rkey = slugify(questId)` so quest progress is addressable
- If PDS write fails, in-memory state is authoritative; retry on next change

---

### 1.8 CLI Quest Tracker UI

#### HintBar updates
The HintBar currently shows `Tab=info`. When the player has active quests, also show:
```
Tab=info  Q=quests  (Wolf Problem: 2/3 wolves)
```
The rightmost part shows the most recently updated quest's current objective as a micro-tracker.

#### InfoPanel quest column (optional, deferred)
If the InfoPanel gets too crowded with 4 columns, the quest log could replace the map in the InfoPanel when `Q` is pressed instead of `Tab`. Or a separate `QuestPanel` could be toggled.

**Simpler initial approach:** Quest progress is tracked via narrative messages only. The HintBar shows the active objective. Full quest log available via `quest log` command.

#### Quest update notification
When a `quest_update` message arrives with a newly completed objective, display a styled narrative line:
```
✓ Quest objective complete: Kill grey wolves (3/3)
```
When quest completes:
```
★ Quest complete: The Wolf Problem! (+150 XP, +25 gold)
```

In `use-game-state.ts`: handle `quest_update` and `quest_log` messages, maintain `state.quests`.

---

## Part 2: Crafting System

### 2.1 Crafting Lexicons (already in place)

The `craft/` directory exists in lexicons. Create:

**`lexicons/com/cacheblasters/fm/craft/recipe.json`** — a recipe template:

```json
{
  "lexicon": 1,
  "id": "com.cacheblasters.fm.craft.recipe",
  "defs": {
    "main": {
      "type": "record",
      "key": "any",
      "description": "A crafting recipe. Defines inputs, required station, and output.",
      "record": {
        "type": "object",
        "required": ["name", "ingredients", "output"],
        "properties": {
          "name": { "type": "string", "maxLength": 128 },
          "description": { "type": "string", "maxLength": 1024 },
          "station": { "type": "string", "description": "Required station type ID (e.g. 'forge', 'alchemy'). Omit for hand-crafting." },
          "levelRequired": { "type": "integer", "minimum": 1 },
          "ingredients": { "type": "array", "items": { "type": "ref", "ref": "#ingredient" } },
          "output": { "type": "ref", "ref": "#outputItem" },
          "successChance": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Base success % (default 100)" },
          "tags": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "ingredient": {
      "type": "object",
      "required": ["itemId", "count"],
      "properties": {
        "itemId": { "type": "string", "description": "Item definition ID" },
        "count": { "type": "integer", "minimum": 1 }
      }
    },
    "outputItem": {
      "type": "object",
      "required": ["itemId", "count"],
      "properties": {
        "itemId": { "type": "string", "description": "Item definition ID" },
        "count": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

After creating, run `bun run generate` in `packages/lexicons` to regenerate TS types.

---

### 2.2 Recipe & Gathering Definitions (YAML)

Add `recipes.yml` and optionally `gathering.yml` per area.

**Example: `data/areas/dark-forest/recipes.yml`**

```yaml
recipes:
  - id: silk-bandage
    name: "Silk Bandage"
    description: "Crude bandages made from spider silk. Restores a small amount of HP."
    ingredients:
      - itemId: dark-forest/spider-silk
        count: 3
    output:
      itemId: dark-forest/silk-bandage
      count: 1
    tags: [alchemy, field-craft]

  - id: wolf-stew
    name: "Wolf Stew"
    description: "A hearty stew that temporarily boosts Constitution."
    station: campfire
    ingredients:
      - itemId: dark-forest/wolf-pelt
        count: 1
      - itemId: starter-town/bread-loaf
        count: 1
    output:
      itemId: dark-forest/wolf-stew
      count: 1
```

**Example: `data/areas/dark-forest/gathering.yml`**

```yaml
gathering:
  - id: herb-patch
    name: "Herb Patch"
    description: "A cluster of wild herbs growing in the shadow of ancient trees."
    yields:
      - itemId: dark-forest/forest-herb
        chance: 80
        min: 1
        max: 3
      - itemId: dark-forest/rare-mushroom
        chance: 15
        min: 1
        max: 1
    respawnSeconds: 120
    spawns:
      - room: dark-forest/mossy-clearing
      - room: dark-forest/ancient-grove
```

**New item definitions to add alongside recipes:**

In `dark-forest/items.yml`:
- `spider-silk` — material, stackable, common drop (add as loot on forest-spider)
- `wolf-pelt` — material, stackable, common drop (add as loot on grey-wolf)
- `silk-bandage` — consumable, heals 15 HP, craftable
- `wolf-stew` — consumable, heals 30 HP + temporary CON buff, craftable
- `forest-herb` — material, stackable, gathered
- `rare-mushroom` — material, stackable, rare gather

---

### 2.3 Crafting Stations (Room Flags / Room Items)

Crafting stations are declared in room definitions as room flags or as special room items.

**Option A (simpler): Room flags**

In `rooms.yml`, add a flag like `station:forge`, `station:alchemy`, `station:campfire`. The crafting system reads `room.flags` to find available stations.

```yaml
- id: smithy
  title: "Grimjaw's Smithy"
  flags: [safe, station:forge]
```

**Option B: Station field on rooms**

Add optional `stations: [forge, alchemy]` to room YAML. Either works; Option A is simpler since room flags already exist.

**Validation:** When crafting, check if recipe requires a station and if that station exists in the current room's flags.

---

### 2.4 Data Layer: CraftingSystem

**`apps/dungeon-server/src/systems/crafting-system.ts`** (new)

```typescript
class CraftingSystem {
  private recipes: Map<string, RecipeDefinition>
  private gatheringNodes: Map<string, GatheringNode[]> // roomId → nodes in that room
  private nodeRespawnQueue: Map<string, { node: GatheringNode; availableAt: number }>

  registerRecipe(id: string, def: RecipeDefinition): void
  registerGatheringNode(roomId: string, node: GatheringNode): void

  // Find craftable recipes for player (has ingredients, meets level, station available)
  getCraftableRecipes(session: CharacterSession, room: Room): RecipeDefinition[]

  // Execute craft attempt
  craft(session: CharacterSession, room: Room, recipeId: string): CraftResult

  // Gather from a node in current room
  gather(session: CharacterSession, room: Room, nodeName: string): GatherResult

  processRespawns(): void // called on game tick
}

interface CraftResult {
  success: boolean;
  recipe?: RecipeDefinition;
  output?: ItemInstance;
  missingIngredients?: { name: string; have: number; need: number }[];
  reason?: string;
}

interface GatherResult {
  success: boolean;
  items?: ItemInstance[];
  reason?: string;
}
```

The `craft()` method:
1. Find the recipe by name/ID
2. Validate station requirement (check room flags)
3. Validate level requirement
4. Check all ingredients present in inventory
5. Roll success chance (if < 100%)
6. On success: remove ingredients, create output item, add to inventory
7. On fail (if success chance < 100%): consume ingredients anyway (partial resource sink)
8. Return `CraftResult` for narrative feedback

Add `craftingSystem: CraftingSystem` to `WorldContext`.

---

### 2.5 Crafting Commands (`apps/dungeon-server/src/commands/crafting.ts`)

```
recipes                 — list recipes you can currently craft (given inventory + station)
recipes all             — list all known recipes regardless of ingredients
craft <recipe name>     — attempt to craft an item
gather                  — gather from a resource node in the current room
gather <node name>      — gather from a specific node if multiple are present
```

**`recipes` output:**
```
=== Craftable Recipes ===
  silk-bandage    — 3x spider silk → 1x Silk Bandage
  wolf-stew       — 1x wolf pelt, 1x bread → 1x Wolf Stew  [needs: campfire]
```

**`craft silk bandage` output:**
```
You carefully weave the spider silk into crude bandages.
You craft: Silk Bandage (x1)
```
or on failure:
```
Your hands slip — the silk tears. You fail to craft anything.
```

**`gather` output:**
```
You forage through the underbrush...
You gather: Forest Herb (x2), Rare Mushroom (x1)
```

Register in `commands/index.ts`:
```typescript
case "recipes":
case "recipe":
  handleCrafting(cmd, ctx); break;
case "craft":
  handleCraft(cmd, ctx); break;
case "gather":
  handleGather(cmd, ctx); break;
```

---

### 2.6 Integration with Quests

Crafting and quests connect naturally:
- **Collect objectives** automatically trigger when a crafted item lands in inventory (the `recordCollect` hook runs on `session.addItem()`)
- Quests can require crafted items as delivery targets
- Future: add `craft` as a new objective type if needed

---

### 2.7 CLI Crafting UI

**No new panel needed.** Crafting is command-driven and uses the existing narrative output.

When `recipes` is sent as a command, display a formatted list via `narrative` messages. The same pattern as `shop`.

**Crafting notification on success** uses styled narrative:
```
[craft] You craft: Silk Bandage (x1) — added to inventory.
```

Use `style: "info"` in `NarrativeMessage`.

---

## Part 3: Implementation Order

The recommended build order minimizes merge complexity and lets each piece be tested independently.

| Step | Work | Depends On |
|------|------|-----------|
| 1 | `craft/recipe.json` lexicon + TS types (run generate) | — |
| 2 | Add material item definitions + loot drops (spider-silk, wolf-pelt) | — |
| 3 | Add recipe YAML + `CraftingSystem` + crafting commands | Step 1-2 |
| 4 | Add gathering nodes YAML + `gather` command | Step 3 |
| 5 | Add `quests.yml` schema + `QuestManager` | — |
| 6 | Quest commands (accept, log, abandon) | Step 5 |
| 7 | Objective tracking hooks (kill, collect, talk, visit) | Steps 5-6 |
| 8 | Quest turn-in + rewards | Step 7 |
| 9 | Write first quests in YAML (wolf-problem, potion-delivery) | Step 8 |
| 10 | Protocol messages (quest_update, quest_log) + CLI handling | Step 6 |
| 11 | PDS persistence (async write/read) | Step 8 |
| 12 | HintBar quest micro-tracker + narrative notifications | Step 10 |
| 13 | Integration testing: full quest loops, crafting loops | All |

---

## Part 4: Test Coverage

### Unit tests (`packages/common`)
- `QuestManager`: acceptQuest, recordKill/collect/talk, objective completion, prerequisite checks
- `CraftingSystem`: recipe lookup, ingredient validation, success roll, station check
- XP reward calculation for quests vs. kill XP

### E2E tests (`apps/dungeon-server/test/e2e.test.ts`)

New test groups to add:

**Quest flow:**
```typescript
describe("quests", () => {
  it("player can see available quests from questgiver NPC")
  it("player can accept a quest")
  it("kill objective advances on NPC death")
  it("collect objective advances on item pickup")
  it("talk objective advances on NPC dialogue")
  it("quest completes when all objectives done")
  it("turn-in grants XP and gold rewards")
  it("item rewards added to inventory on turn-in")
  it("prerequisites block quest acceptance")
  it("quest_update message sent on objective advance")
  it("quest_log sent on connect")
})
```

**Crafting flow:**
```typescript
describe("crafting", () => {
  it("recipes lists craftable recipes with ingredients")
  it("craft succeeds when ingredients present")
  it("craft removes ingredients from inventory")
  it("craft adds output to inventory")
  it("craft fails gracefully without ingredients")
  it("craft respects station requirement")
  it("gather yields items from node")
  it("gather respects respawn timer")
  it("crafted item triggers collect quest objective")
})
```

---

## Part 5: Scope Boundaries (What We're NOT Doing in Phase 4)

To keep Phase 4 focused, the following are explicitly deferred to later phases:

- **Skill trees / crafting XP** — crafting does not level up separately (Phase 5+)
- **Recipe discovery** — all recipes are known by default (no recipe learning needed)
- **Multi-step crafting** — all crafting is single-action (no smelting-then-forging pipeline)
- **Auction house / player trading** — economy beyond buy/sell deferred to Phase 5
- **Server attestation on quest rewards** — deferred to Phase 5 (federation work)
- **Cross-server quest federation** — quests are server-local; PDS persistence enables cross-server *progress*, not cross-server *quest definitions*

---

## Summary: Files to Create / Modify

### New files
| File | Purpose |
|------|---------|
| `lexicons/com/cacheblasters/fm/craft/recipe.json` | Crafting recipe lexicon schema |
| `apps/dungeon-server/src/systems/quest-manager.ts` | Quest state management |
| `apps/dungeon-server/src/systems/crafting-system.ts` | Crafting & gathering engine |
| `apps/dungeon-server/src/commands/quest.ts` | Quest commands |
| `apps/dungeon-server/src/commands/crafting.ts` | Craft/gather/recipes commands |
| `apps/dungeon-server/data/areas/starter-town/quests.yml` | Starter town quest definitions |
| `apps/dungeon-server/data/areas/dark-forest/quests.yml` | Dark forest quest definitions |
| `apps/dungeon-server/data/areas/dark-forest/recipes.yml` | Crafting recipes |
| `apps/dungeon-server/data/areas/dark-forest/gathering.yml` | Gathering node definitions |

### Modified files
| File | Change |
|------|--------|
| `packages/lexicons/src/index.ts` | Add `RecipeDef`, `RecipeIngredient` types after codegen |
| `packages/protocol/src/messages.ts` | Add `quest_update`, `quest_log` server messages |
| `packages/common/src/types/character.ts` | Add `activeQuestIds` to `CharacterState` (for reconnect) |
| `apps/dungeon-server/src/world/world-context.ts` | Add `questManager`, `craftingSystem` |
| `apps/dungeon-server/src/world/area-manager.ts` | Load `quests.yml`, `recipes.yml`, `gathering.yml` |
| `apps/dungeon-server/src/systems/combat-system.ts` | Add kill objective hook in `handleNpcDeath` |
| `apps/dungeon-server/src/commands/inventory.ts` | Add collect objective hook in `handleTake` |
| `apps/dungeon-server/src/commands/interaction.ts` | Add talk objective hook in `handleTalk` |
| `apps/dungeon-server/src/commands/index.ts` | Register quest/craft commands; add to allowlists |
| `apps/dungeon-server/src/index.ts` | Send `quest_log` on connect |
| `apps/dungeon-server/data/areas/dark-forest/items.yml` | Add material items (silk, pelt, herb, mushroom) |
| `apps/dungeon-server/data/areas/dark-forest/npcs.yml` | Update loot tables to drop material items |
| `apps/cli-client/src/hooks/use-game-state.ts` | Handle `quest_update`, `quest_log` messages |
| `apps/cli-client/src/components/HintBar.tsx` | Quest micro-tracker in hints |
