# Phase 5 Plan: Federation & AT Proto Authentication

**Status:** Planning
**Depends on:** Phase 4 (complete)
**Deferred to Phase 6:** Second server deployment, world data publishing as AT Proto records, dynamic portal discovery

---

## Overview

Phase 5 replaces dev mode with real AT Proto authentication, adds PDS-backed character
persistence, and implements the portal traversal protocol for cross-server federation.

**Key architectural decisions:**
- Each dungeon server runs alongside its own PDS (via docker-compose)
- Players can create accounts directly on the server's PDS (no Bluesky account required)
- Players with existing AT Proto accounts (Bluesky etc.) can also authenticate
- Server identity uses `did:plc` (registered through the co-located PDS)
- Static portals for Phase 5; dynamic discovery deferred to Phase 6
- Dev mode is removed — the hosted PDS replaces it for local testing

---

## Part 1: PDS Deployment

### 1.1 Docker Compose Setup

Add `@atproto/pds` as a second container alongside the dungeon server.

```yaml
services:
  pds:
    image: ghcr.io/bluesky-social/pds:latest
    ports:
      - "${PDS_PORT:-2583}:3000"
    volumes:
      - pds-data:/pds
    environment:
      - PDS_HOSTNAME=${PDS_HOSTNAME:-localhost}
      - PDS_DATA_DIRECTORY=/pds
      - PDS_BLOBSTORE_DISK_LOCATION=/pds/blocks
      - PDS_JWT_SECRET=${PDS_JWT_SECRET}
      - PDS_ADMIN_PASSWORD=${PDS_ADMIN_PASSWORD}
      - PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=${PDS_ROTATION_KEY}
      - PDS_DID_PLC_URL=https://plc.directory
      - PDS_INVITE_REQUIRED=false
      - PDS_EMAIL_SMTP_URL=
      - PDS_EMAIL_FROM_ADDRESS=noreply@fm.cacheblasters.com
      - LOG_ENABLED=true
    restart: unless-stopped

  dungeon-server:
    build: .
    ports:
      - "${PORT:-3000}:${PORT:-3000}"
    depends_on:
      - pds
    environment:
      # ... existing env vars ...
      - PDS_URL=http://pds:3000
      - PDS_HOSTNAME=${PDS_HOSTNAME:-localhost}
      - SERVER_DID=${SERVER_DID}
      - OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}
    restart: unless-stopped

volumes:
  pds-data:
```

**Notes:**
- `PDS_HOSTNAME` sets the base domain for handles. Player handles will be
  `<name>.${PDS_HOSTNAME}` (e.g., `kaelith.fm.cacheblasters.com`)
- `PDS_INVITE_REQUIRED=false` allows open account creation
- The PDS uses its own port (2583 externally, 3000 internally)
- PDS data persists in a Docker volume
- DNS: wildcard A record `*.fm.cacheblasters.com` pointing to the host

### 1.2 Server Identity Bootstrap

On first startup, the dungeon server needs its own AT Proto identity:

1. Create an account on the co-located PDS (if `SERVER_DID` is not set):
   ```
   POST /xrpc/com.atproto.server.createAccount
   {
     handle: "server.fm.cacheblasters.com",
     email: "server@fm.cacheblasters.com",
     password: <generated>
   }
   ```
2. This returns a `did:plc` — store it as `SERVER_DID`
3. Authenticate as the server account and publish the server metadata record:
   ```
   PUT com.cacheblasters.fm.world.server/self
   {
     name: "Starter Dungeon",
     description: "A mysterious dungeon awaits...",
     endpoint: "wss://fm.cacheblasters.com/ws",
     xrpcEndpoint: "https://fm.cacheblasters.com/xrpc",
     createdAt: "..."
   }
   ```
4. The server's signing key (from the DID document) is used for attestations and
   transfer JWTs

**Implementation: `apps/dungeon-server/src/atproto/server-identity.ts`**

```typescript
class ServerIdentity {
  did: string;
  agent: AtpAgent;       // authenticated agent for the server's own PDS account
  signingKey: Keypair;   // for signing attestations and transfer JWTs

  async initialize(config: AtProtoConfig): Promise<void>
  async publishServerRecord(): Promise<void>
  signAttestation(claims: AttestationClaims): string      // returns compact JWS
  signTransferToken(payload: TransferPayload): string     // returns JWT
  async verifyTransferToken(jwt: string): Promise<TransferPayload>
}
```

---

## Part 2: Player Authentication (OAuth)

### 2.1 OAuth Client Setup

The dungeon server acts as an OAuth client. AT Proto uses OAuth 2.0 with DPoP-bound
tokens and PKCE.

**OAuth client metadata** must be served at a well-known URL:
```
GET https://fm.cacheblasters.com/oauth/client-metadata.json
{
  "client_id": "https://fm.cacheblasters.com/oauth/client-metadata.json",
  "client_name": "Federated Realms",
  "client_uri": "https://fm.cacheblasters.com",
  "redirect_uris": ["https://fm.cacheblasters.com/oauth/callback",
                     "http://127.0.0.1/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "atproto transition:generic",
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "none",
  "application_type": "web"
}
```

The `http://127.0.0.1` redirect URI supports the CLI client's localhost OAuth flow.

**Implementation:** Use `@atproto/oauth-client-node` which handles:
- Resolving user handle → DID → PDS → authorization server metadata
- PKCE code challenge generation
- DPoP key generation and proof signing
- Token exchange and refresh
- Session storage (needs a `NodeSavedSessionStore` and `NodeSavedStateStore`)

**`apps/dungeon-server/src/atproto/oauth.ts`**

```typescript
import { NodeOAuthClient } from '@atproto/oauth-client-node';

class GameOAuthClient {
  private client: NodeOAuthClient;

  async initialize(config: OAuthConfig): Promise<void> {
    this.client = new NodeOAuthClient({
      clientMetadata: { /* ... */ },
      stateStore: new FileSessionStore('./data/oauth-states'),
      sessionStore: new FileSessionStore('./data/oauth-sessions'),
    });
  }

  // Start OAuth flow — returns URL to redirect user to
  async startAuth(handle: string): Promise<{ url: string; state: string }>

  // Handle OAuth callback — returns authenticated session
  async handleCallback(params: URLSearchParams): Promise<OAuthSession>

  // Get an authenticated agent for a player's PDS
  async getAgentForDid(did: string): Promise<AtpAgent | null>
}
```

### 2.2 Authentication Flow

**Web client:**
```
1. Player enters handle (e.g., "kaelith.fm.cacheblasters.com")
2. Client calls: GET /auth/login?handle=kaelith.fm.cacheblasters.com
3. Server resolves handle → starts OAuth → returns redirect URL
4. Browser navigates to PDS authorization page
5. Player approves
6. PDS redirects to /oauth/callback?code=...&state=...
7. Server exchanges code → gets session with DPoP-bound tokens
8. Server calls XRPC connect endpoint internally
9. Returns sessionId + wsUrl to client
```

**CLI client:**
```
1. Player enters handle
2. CLI starts localhost HTTP server on random port
3. CLI calls: GET /auth/login?handle=...&redirect=http://127.0.0.1:{port}/callback
4. Opens browser for PDS authorization
5. PDS redirects to localhost callback
6. CLI captures code, sends to server
7. Server exchanges code → returns sessionId + wsUrl
8. CLI connects WebSocket
```

### 2.3 Account Creation (New Players on Our PDS)

For players without an AT Proto account, the client (web or CLI) can create one
on the server's co-located PDS directly:

```
1. Player clicks "Create Account" / enters desired handle
2. Client calls PDS directly:
   POST https://pds.fm.cacheblasters.com/xrpc/com.atproto.server.createAccount
   { handle: "kaelith.fm.cacheblasters.com", email: "...", password: "..." }
3. PDS creates account, returns DID + access tokens
4. Client proceeds with normal OAuth flow (or uses the returned session directly)
```

The dungeon server doesn't need special account-creation endpoints — the PDS
handles this natively. The client just needs to know the PDS URL to call directly.

### 2.4 XRPC Endpoints

Add proper XRPC endpoints to the dungeon server (served on the same HTTP port):

**`/xrpc/com.cacheblasters.fm.action.connect`** (POST)
```
Input: { characterDid: string }  — DID from OAuth session
Output (existing character):
  { sessionId, websocketUrl, spawnRoom, characterState }
Output (new player):
  { needsCharacter: true, gameSystem: { classes, races, attributes, spells } }
```

**`/xrpc/com.cacheblasters.fm.action.createCharacter`** (POST) — new lexicon
```
Input: { name, classId, raceId }
Output: { sessionId, websocketUrl, spawnRoom, characterState }
Side effect: writes com.cacheblasters.fm.character.profile to player's PDS
```

Auth: Both endpoints require a valid OAuth bearer token. The server validates
the DPoP proof and extracts the player DID.

**`/xrpc/com.cacheblasters.fm.action.reconnect`** (POST) — optional
For resuming a dropped session without full re-auth.

### 2.5 Server HTTP Routes (updated)

```
GET  /health                          — health check (unchanged)
GET  /info                            — server info (unchanged)
GET  /system                          — game system schema (unchanged)
GET  /oauth/client-metadata.json      — OAuth client metadata
GET  /auth/login?handle=...           — start OAuth flow
GET  /oauth/callback?code=...        — OAuth callback
POST /xrpc/com.cacheblasters.fm.action.connect         — authenticate + connect
POST /xrpc/com.cacheblasters.fm.action.createCharacter  — create character
POST /xrpc/com.cacheblasters.fm.federation.transfer     — portal transfer (Phase 5D)
WS   /ws?session=...                  — WebSocket game (unchanged, but now requires valid session)
```

---

## Part 3: PDS Persistence

### 3.1 Character Profile

**Read on connect:**
```typescript
async function loadCharacterFromPds(agent: AtpAgent, did: string): Promise<CharacterProfile | null> {
  try {
    const { data } = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: NSID.CharacterProfile,
      rkey: 'self',
    });
    return data.value as CharacterProfile;
  } catch (e) {
    if (e.status === 404) return null; // new player
    throw e;
  }
}
```

**Write on state changes (fire-and-forget):**
```typescript
async function saveCharacterToPds(agent: AtpAgent, did: string, state: CharacterState): Promise<void> {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: NSID.CharacterProfile,
    rkey: 'self',
    record: {
      name: state.name,
      class: state.class,
      race: state.race,
      level: state.level,
      experience: state.experience,
      attributes: state.attributes,
      derived: { maxHp: state.maxHp, maxMp: state.maxMp, maxAp: state.maxAp },
      homeServer: serverIdentity.did,
      extensions: state.extensions,
      createdAt: state.createdAt,
      updatedAt: new Date().toISOString(),
    },
  });
}
```

**When to write:**
- On level up
- On disconnect (full snapshot)
- Debounced: at most once per 30 seconds for incremental changes

### 3.2 Quest Progress

```typescript
async function saveQuestProgress(agent: AtpAgent, did: string, questId: string, progress: ActiveQuestState): Promise<void> {
  const rkey = questId.replace(/[^a-zA-Z0-9-]/g, '-'); // sanitize for rkey
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: NSID.QuestProgress,
    rkey,
    record: {
      questId: progress.questId,
      serverId: serverIdentity.did,
      status: progress.status,
      objectives: progress.objectives,
      acceptedAt: progress.acceptedAt,
      completedAt: progress.completedAt,
    },
  });
}
```

**Read on connect:** List all quest progress records, warm QuestManager.

### 3.3 Server Attestation

When the server makes significant changes to a character (level up, item grant, quest
reward), it signs an attestation proving the change was legitimate.

```typescript
interface Attestation {
  iss: string;           // server DID
  sub: string;           // player DID
  iat: number;           // timestamp
  claims: {
    level?: number;
    xp?: number;
    itemsGranted?: string[];   // item definition IDs
    questsCompleted?: string[];
    gold?: number;
  };
}
```

Attestations are stored in the character profile's `extensions` field:
```typescript
extensions: {
  [serverDid]: {
    attestations: Attestation[],
    // server-specific data preserved across transfers
    customData: { ... }
  }
}
```

On transfer, the receiving server can:
1. Resolve the signing server's DID document
2. Extract the public key
3. Verify the attestation signature
4. Decide what to trust based on its trust policy

**Implementation: `apps/dungeon-server/src/atproto/attestation.ts`**

```typescript
class AttestationManager {
  constructor(private serverIdentity: ServerIdentity) {}

  // Create a signed attestation for a state change
  sign(playerDid: string, claims: AttestationClaims): SignedAttestation

  // Verify an attestation from another server
  async verify(attestation: SignedAttestation): Promise<{ valid: boolean; issuerDid: string }>

  // Add attestation to character extensions
  addToProfile(profile: CharacterProfile, attestation: SignedAttestation): void
}
```

---

## Part 4: Portal Framework

### 4.1 Portal Exit Definition

Portal exits are room exits with `portal: true` and a cross-server target:

```yaml
# rooms.yml
- id: portal-chamber
  title: "The Shimmering Gate"
  description: >
    A towering archway of crystallized mana hums with energy. Through the
    wavering surface you glimpse alien landscapes — another realm entirely.
    The portal seems stable enough to traverse.
  flags: [safe, portal]
  exits:
    - direction: north
      target: "did:plc:abc123xyz:arrival-hall"   # serverDID:roomId
      portal: true
      requiredLevel: 3
      description: "The portal shimmers with otherworldly energy."
```

Target format: `<serverDID>:<roomId>` — the server DID identifies the remote server,
the room ID is where the player arrives.

### 4.2 New Lexicons

**`lexicons/com/cacheblasters/fm/federation/transfer.json`**
```json
{
  "lexicon": 1,
  "id": "com.cacheblasters.fm.federation.transfer",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Request character transfer from source to target server",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["token", "character"],
          "properties": {
            "token": { "type": "string", "description": "JWT signed by source server" },
            "character": { "type": "unknown", "description": "Full character profile snapshot" },
            "attestations": { "type": "unknown", "description": "Array of signed attestations" }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["accepted"],
          "properties": {
            "accepted": { "type": "boolean" },
            "sessionId": { "type": "string" },
            "websocketUrl": { "type": "string", "format": "uri" },
            "spawnRoom": { "type": "string" },
            "reason": { "type": "string" }
          }
        }
      }
    }
  }
}
```

**`lexicons/com/cacheblasters/fm/action/createCharacter.json`**
```json
{
  "lexicon": 1,
  "id": "com.cacheblasters.fm.action.createCharacter",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Create a new character on this server",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["name", "classId", "raceId"],
          "properties": {
            "name": { "type": "string", "maxLength": 64 },
            "classId": { "type": "string" },
            "raceId": { "type": "string" }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["sessionId", "websocketUrl", "spawnRoom"],
          "properties": {
            "sessionId": { "type": "string" },
            "websocketUrl": { "type": "string", "format": "uri" },
            "spawnRoom": { "type": "string" },
            "characterState": { "type": "unknown" }
          }
        }
      }
    }
  }
}
```

### 4.3 Transfer Protocol

**Source server (player enters portal):**

```typescript
async function handlePortalTraversal(session: CharacterSession, exit: RoomExit): Promise<void> {
  const [targetServerDid, targetRoomId] = parsePortalTarget(exit.target);

  // 1. Validate requirements
  if (exit.requiredLevel && session.state.level < exit.requiredLevel) {
    sendNarrative(session, `The portal rejects you. You must be level ${exit.requiredLevel}.`, "error");
    return;
  }

  // 2. Resolve target server's XRPC endpoint
  const targetEndpoint = await resolveServerXrpc(targetServerDid);
  if (!targetEndpoint) {
    sendNarrative(session, "The portal flickers and dies. The destination realm is unreachable.", "error");
    return;
  }

  // 3. Snapshot character state
  const snapshot = buildCharacterSnapshot(session);
  const attestations = getAttestationsForPlayer(session.characterDid);

  // 4. Sign transfer JWT
  const token = serverIdentity.signTransferToken({
    iss: serverIdentity.did,
    sub: session.characterDid,
    aud: targetServerDid,
    exp: Math.floor(Date.now() / 1000) + 60,
    iat: Math.floor(Date.now() / 1000),
    characterHash: sha256(JSON.stringify(snapshot)),
    targetRoom: targetRoomId,
  });

  // 5. Call target server's transfer XRPC
  const response = await fetch(`${targetEndpoint}/xrpc/com.cacheblasters.fm.federation.transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, character: snapshot, attestations }),
  });

  const result = await response.json();

  if (!result.accepted) {
    sendNarrative(session, `The portal rejects you: ${result.reason}`, "error");
    return;
  }

  // 6. Send portal_offer to client
  session.send(encodeMessage({
    type: "portal_offer",
    targetServer: {
      name: result.serverName ?? "Unknown Realm",
      did: targetServerDid,
      endpoint: result.websocketUrl,
    },
    sessionId: result.sessionId,
    websocketUrl: result.websocketUrl,
  }));

  // 7. Save character to PDS before disconnect
  await saveCharacterToPds(session);
}
```

**Target server (receiving transfer):**

```typescript
async function handleTransferRequest(input: TransferInput): Promise<TransferOutput> {
  // 1. Verify JWT
  const payload = await verifyTransferJwt(input.token);
  if (!payload) return { accepted: false, reason: "Invalid transfer token" };

  // 2. Check expiry
  if (payload.exp < Date.now() / 1000) return { accepted: false, reason: "Transfer expired" };

  // 3. Verify audience (it's meant for us)
  if (payload.aud !== serverIdentity.did) return { accepted: false, reason: "Wrong destination" };

  // 4. Verify character hash
  const hash = sha256(JSON.stringify(input.character));
  if (hash !== payload.characterHash) return { accepted: false, reason: "Character tampered" };

  // 5. Apply trust policy
  const trustedCharacter = applyTrustPolicy(input.character, payload.iss, input.attestations);

  // 6. Check level range
  if (trustedCharacter.level > config.maxLevel) {
    return { accepted: false, reason: `Level ${trustedCharacter.level} exceeds server max (${config.maxLevel})` };
  }

  // 7. Create session for the incoming player
  const profile = adaptCharacterToLocalSystem(trustedCharacter);
  const session = sessionManager.createSession(payload.sub, profile, payload.targetRoom, formulas);

  return {
    accepted: true,
    sessionId: session.sessionId,
    websocketUrl: `wss://${config.host}/ws?session=${session.sessionId}`,
    spawnRoom: payload.targetRoom,
  };
}
```

### 4.4 Trust Policies

```typescript
interface TrustConfig {
  defaultPolicy: "trust-all" | "trust-listed" | "trust-none" | "trust-level-cap";
  trustedServers?: string[];   // array of DIDs for trust-listed
  maxAcceptedLevel?: number;   // for trust-level-cap
}

function applyTrustPolicy(character: CharacterProfile, sourceServerDid: string, attestations: SignedAttestation[]): CharacterProfile {
  switch (config.trustPolicy) {
    case "trust-all":
      return character; // accept everything

    case "trust-listed":
      if (!config.trustedServers.includes(sourceServerDid)) {
        // Strip items/gold, keep level/XP/attributes
        return { ...character, extensions: {} };
      }
      return character;

    case "trust-none":
      // Accept character identity but strip all gear/gold
      return {
        ...character,
        extensions: {},
        // inventory and equipment handled by session creation
      };

    case "trust-level-cap":
      return {
        ...character,
        level: Math.min(character.level, config.maxAcceptedLevel),
      };
  }
}
```

### 4.5 Character Adaptation

When a character arrives from another server, their class/race IDs may not match
the local server's system definitions. The adaptation layer handles this:

```typescript
function adaptCharacterToLocalSystem(character: CharacterProfile): CharacterProfile {
  const localSystem = world.gameSystem;

  // Check if class exists locally
  if (!localSystem.classes[character.class]) {
    // Fall back to a default class, preserve original in extensions
    character.extensions = {
      ...character.extensions,
      _originalClass: character.class,
    };
    character.class = "warrior"; // safe default
  }

  // Same for race
  if (!localSystem.races[character.race]) {
    character.extensions = {
      ...character.extensions,
      _originalRace: character.race,
    };
    character.race = "human";
  }

  // Recompute derived stats using local formulas
  character.derived = computeDerivedStats(localSystem.formulas, character.level, character.attributes);

  return character;
}
```

### 4.6 Protocol Messages (additions)

```typescript
// Server → Client: offer portal traversal to another server
| {
    type: "portal_offer";
    targetServer: { name: string; did: string; endpoint: string };
    sessionId: string;
    websocketUrl: string;
  }
```

**Client behavior on portal_offer:**
1. Display "Entering portal to [server name]..."
2. Close current WebSocket connection
3. Open new WebSocket to `websocketUrl` with `sessionId`
4. Wait for `welcome` + `room_state` from the new server
5. Game continues seamlessly

### 4.7 DID Resolution for Transfer

To verify transfer JWTs and resolve server endpoints, we need DID resolution:

```typescript
async function resolveServerXrpc(did: string): Promise<string | null> {
  // Resolve DID document
  const didDoc = await resolveDid(did);
  if (!didDoc) return null;

  // Find the service endpoint
  const service = didDoc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
  if (!service) return null;

  // Read the server record from their PDS
  const { data } = await fetch(`${service.serviceEndpoint}/xrpc/com.atproto.repo.getRecord?` +
    `repo=${did}&collection=com.cacheblasters.fm.world.server&rkey=self`);

  return data.value.xrpcEndpoint ?? service.serviceEndpoint;
}
```

---

## Part 5: CLI Client Overhaul

### 5.1 Zero-Arg Launch & Splash Screen

The CLI client should launch with no required arguments. Running `bun run start`
(or the built binary) shows a splash screen and guides the user through setup.

**Current behavior:** Requires `--host`, `--port`, `--name` CLI args.
**New behavior:** Launches into a multi-phase Ink UI with no args needed.

**Phase 1: Splash Screen**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│           ╔═══════════════════════════════╗           │
│           ║     FEDERATED REALMS          ║           │
│           ║     A Federated MUD Client    ║           │
│           ╚═══════════════════════════════╝           │
│                                                      │
│              by OtherwiseJunk                        │
│                                                      │
│           Built on the AT Protocol                   │
│                                                      │
│                                                      │
│           Press any key to continue...               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Phase 2: Account Setup**

The client needs to know (a) which PDS to talk to, and (b) the user's credentials.
These are saved locally so the user only configures once.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Account Setup                                       │
│                                                      │
│  Do you have an AT Protocol account?                 │
│                                                      │
│  > [1] Sign in with existing account                 │
│    [2] Create a new account                          │
│    [3] Load saved profile                            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Option 1: Sign in with existing account**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Sign In                                             │
│                                                      │
│  Handle or DID:                                      │
│  > kaelith.bsky.social                               │
│                                                      │
│  [Opening browser for authorization...]              │
│  Waiting for approval...                             │
│                                                      │
│  ✓ Signed in as kaelith.bsky.social                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The client resolves the handle to find the user's PDS, then initiates OAuth via
browser redirect (localhost callback).

**Option 2: Create a new account**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Create Account                                      │
│                                                      │
│  Server PDS URL:                                     │
│  > https://fm.cacheblasters.com                      │
│                                                      │
│  Desired handle:                                     │
│  > kaelith                                           │
│    (→ kaelith.fm.cacheblasters.com)                  │
│                                                      │
│  Email:                                              │
│  > kaelith@example.com                               │
│                                                      │
│  Password:                                           │
│  > ••••••••                                          │
│                                                      │
│  Creating account...                                 │
│  ✓ Account created: kaelith.fm.cacheblasters.com     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

This calls the PDS's `com.atproto.server.createAccount` endpoint directly.

**Option 3: Load saved profile**

After first login, the client saves the account info (handle, DID, PDS URL, refresh
token) to `~/.federated-realms/profile.json`. Subsequent launches auto-detect this
and skip to server selection.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Welcome back, kaelith!                              │
│  (kaelith.fm.cacheblasters.com)                      │
│                                                      │
│  [1] Continue (connect to last server)               │
│  [2] Choose a different server                       │
│  [3] Switch account                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Phase 3: Server Selection**

After authentication, the client needs to know which dungeon server to connect to.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Choose a Server                                     │
│                                                      │
│  Enter server URL:                                   │
│  > https://fm.cacheblasters.com                      │
│                                                      │
│  Connecting...                                       │
│  ✓ Starter Dungeon — "A mysterious dungeon awaits"   │
│    16 rooms, 2 players online                        │
│                                                      │
│  Press Enter to join...                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The client fetches `/info` from the server, then calls the `action.connect` XRPC
endpoint with the player's DID. If the player has no character on this server,
it transitions to character creation (Phase 4).

**Phase 4: Character Creation (if needed)**

The existing `CharacterCreate` component is reused, but now it receives the game
system data from the XRPC `action.connect` response (which includes available
classes, races, and attributes) rather than from a separate `/system` fetch.

**Phase 5: Gameplay**

Same as current — `GameView` with `StatusBar`, `RoomPanel`, `NarrativeView`,
`InputBar`, etc. The only change is that the WebSocket now connects with a
session ID from the XRPC flow instead of query-param credentials.

### 5.2 Saved Profile Format

```typescript
// ~/.federated-realms/profile.json
interface SavedProfile {
  handle: string;           // "kaelith.fm.cacheblasters.com"
  did: string;              // "did:plc:abc123..."
  pdsUrl: string;           // "https://fm.cacheblasters.com"
  lastServer?: string;      // "https://fm.cacheblasters.com"
  // Refresh token stored separately in OS keychain or encrypted file
}
```

### 5.3 CLI App Phases (updated)

The App component currently has 3 phases: `loading → create → play`.
This becomes 5 phases:

```typescript
type AppPhase =
  | "splash"       // splash screen, press any key
  | "account"      // sign in / create account / load saved
  | "server"       // enter server URL, connect
  | "create"       // character creation (if no character on this server)
  | "play";        // gameplay
```

### 5.4 Portal Handling

When the client receives `portal_offer`:
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  The portal shimmers and pulls you through...        │
│                                                      │
│  Connecting to: The Frozen Wastes                    │
│  ████████████████████░░░░░ 80%                       │
│                                                      │
│  ✓ Connected!                                        │
│                                                      │
│  --- The Frozen Wastes ---                           │
│  You step out of a crackling portal into biting cold │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Part 6: Implementation Order

| Step | Work | Depends On |
|------|------|-----------|
| 1 | Update docker-compose.yml with PDS container | — |
| 2 | `ServerIdentity` class — DID creation, key management, server record publishing | Step 1 |
| 3 | `GameOAuthClient` — OAuth client setup, auth flow, token management | Step 1 |
| 4 | New lexicons: `action.createCharacter`, `federation.transfer` + codegen | — |
| 5 | XRPC endpoints: `action.connect`, `action.createCharacter` | Steps 2-3 |
| 6 | Replace dev mode in index.ts — require OAuth, load character from PDS | Step 5 |
| 7 | PDS read/write: character profile persistence | Step 6 |
| 8 | PDS read/write: quest progress persistence | Step 7 |
| 9 | `AttestationManager` — sign/verify character state claims | Step 2 |
| 10 | `PortalHandler` — detect portal exits, initiate transfer | Step 9 |
| 11 | `federation.transfer` XRPC handler — receive incoming transfers | Steps 9-10 |
| 12 | Trust policy configuration + character adaptation | Step 11 |
| 13 | `portal_offer` protocol message + CLI client handling | Step 10 |
| 14 | CLI client: splash screen, account setup, server selection, saved profiles | Steps 3, 5 |
| 15 | Update E2E tests for authenticated sessions | Step 6 |

---

## Part 7: Configuration

### New Environment Variables

```env
# ── PDS ──
PDS_URL=http://pds:3000              # Internal PDS URL (docker networking)
PDS_HOSTNAME=fm.cacheblasters.com    # Public PDS hostname (for handles)
PDS_ADMIN_PASSWORD=...               # PDS admin password
PDS_JWT_SECRET=...                   # PDS JWT signing secret
PDS_ROTATION_KEY=...                 # PDS PLC rotation key (hex)

# ── Server Identity ──
SERVER_DID=                          # Auto-created on first boot if empty
SERVER_HANDLE=server.fm.cacheblasters.com
SERVER_PASSWORD=...                  # Password for server's PDS account

# ── OAuth ──
OAUTH_CLIENT_ID=https://fm.cacheblasters.com/oauth/client-metadata.json

# ── Federation ──
TRUST_POLICY=trust-listed            # trust-all | trust-listed | trust-none | trust-level-cap
TRUSTED_SERVERS=                     # Comma-separated DIDs
MAX_ACCEPTED_LEVEL=50
```

### ServerConfig Updates

```typescript
interface AtProtoConfig {
  pdsUrl: string;
  pdsHostname: string;
  serverDid?: string;
  serverHandle: string;
  serverPassword: string;
  oauthClientId: string;
}

interface FederationConfig {
  trustPolicy: "trust-all" | "trust-listed" | "trust-none" | "trust-level-cap";
  trustedServers: string[];
  maxAcceptedLevel: number;
}

interface ServerConfig {
  // ... existing fields ...
  atproto: AtProtoConfig;
  federation: FederationConfig;
}
```

---

## Part 8: New / Modified Files Summary

### New Files
| File | Purpose |
|------|---------|
| `apps/dungeon-server/src/atproto/server-identity.ts` | Server DID + signing key management |
| `apps/dungeon-server/src/atproto/oauth.ts` | OAuth client (player authentication) |
| `apps/dungeon-server/src/atproto/pds-client.ts` | Read/write character & quest data to PDS |
| `apps/dungeon-server/src/atproto/attestation.ts` | Sign/verify character state attestations |
| `apps/dungeon-server/src/federation/portal-handler.ts` | Portal traversal (source side) |
| `apps/dungeon-server/src/federation/transfer-handler.ts` | Receive incoming transfers (target side) |
| `lexicons/com/cacheblasters/fm/action/createCharacter.json` | Character creation XRPC lexicon |
| `lexicons/com/cacheblasters/fm/federation/transfer.json` | Transfer XRPC lexicon |
| `apps/cli-client/src/components/SplashScreen.tsx` | ASCII splash screen with author credit |
| `apps/cli-client/src/components/AccountSetup.tsx` | Sign in / create account / load saved profile |
| `apps/cli-client/src/components/ServerSelect.tsx` | Server URL entry + connection |
| `apps/cli-client/src/connection/auth-client.ts` | OAuth flow, account creation, profile persistence |
| `apps/cli-client/src/connection/saved-profile.ts` | Read/write ~/.federated-realms/profile.json |

### Modified Files
| File | Change |
|------|--------|
| `docker-compose.yml` | Add PDS container, update dungeon-server env |
| `apps/dungeon-server/src/config.ts` | Add atproto + federation config sections |
| `apps/dungeon-server/src/index.ts` | Add XRPC routes, replace dev mode, OAuth callbacks |
| `apps/dungeon-server/src/server/session-manager.ts` | Support PDS-loaded profiles |
| `apps/dungeon-server/src/commands/movement.ts` | Detect portal exits, trigger transfer |
| `packages/protocol/src/messages.ts` | Add `portal_offer` message type |
| `packages/lexicons/src/index.ts` | Add new types after codegen |
| `apps/cli-client/src/components/App.tsx` | Replace 3-phase with 5-phase lifecycle (splash→account→server→create→play) |
| `apps/cli-client/src/index.tsx` | Remove CLI arg parsing, launch App with no args |
| `apps/cli-client/src/connection/ws-client.ts` | Connect with session ID instead of query params |
| `apps/cli-client/src/hooks/use-game-state.ts` | Handle portal_offer (server switch) |
| `apps/dungeon-server/test/e2e.test.ts` | Update to use authenticated sessions |

---

## Part 9: Scope Boundaries (NOT in Phase 5)

- **Dynamic portal discovery** — servers finding each other via Jetstream/firehose (Phase 6)
- **World data publishing** — publishing rooms/NPCs/items as AT Proto records (Phase 6)
- **Second server deployment** — separate content + separate PDS (Phase 6)
- **Cross-server chat relay** — chat bridging between federated servers (Phase 6)
- **Portal hub / server browser** — dynamic server listing room/NPC (Phase 6)
- **Web client OAuth** — web client auth flow (Phase 6, alongside web client)
