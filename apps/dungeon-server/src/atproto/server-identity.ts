import { AtpAgent } from "@atproto/api";
import { Secp256k1Keypair } from "@atproto/crypto";
import { verifySig } from "@atproto/crypto/dist/secp256k1/operations";
import * as jose from "jose";
import type { AtProtoConfig } from "../config.js";
import { NSID } from "@realms/lexicons";

export interface TransferPayload {
  iss: string; // source server DID
  sub: string; // player DID
  aud: string; // target server DID
  iat: number;
  exp: number;
  characterHash: string;
  targetRoom: string;
}

export interface AttestationClaims {
  level?: number;
  xp?: number;
  itemsGranted?: string[];
  questsCompleted?: string[];
  gold?: number;
}

export interface SignedAttestation {
  iss: string; // server DID
  sub: string; // player DID
  iat: number;
  claims: AttestationClaims;
  sig: string; // base64url-encoded signature
}

export class ServerIdentity {
  did = "";
  agent!: AtpAgent;
  private signingKey!: Secp256k1Keypair;
  private jwtPrivateKey!: CryptoKey;

  async initialize(config: AtProtoConfig, serverName: string, serverDescription: string): Promise<void> {
    this.agent = new AtpAgent({ service: config.pdsUrl });

    if (config.serverDid) {
      // Existing server identity — log in
      await this.agent.login({
        identifier: config.serverHandle,
        password: config.serverPassword,
      });
      this.did = config.serverDid;
      console.log(`   Server identity: ${this.did}`);
    } else {
      // First boot — create server account on co-located PDS
      console.log("   Creating server account on PDS...");
      try {
        const result = await this.agent.createAccount({
          handle: config.serverHandle,
          password: config.serverPassword,
        });
        this.did = result.data.did;
        console.log(`   Server account created: ${this.did}`);
        console.log(`   ⚠  Set SERVER_DID=${this.did} in your environment for subsequent boots`);
      } catch (err: unknown) {
        // Account may already exist if SERVER_DID was lost
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("handle already taken") || message.includes("Handle already taken")) {
          console.log("   Server account already exists, logging in...");
          await this.agent.login({
            identifier: config.serverHandle,
            password: config.serverPassword,
          });
          this.did = this.agent.session?.did ?? "";
          console.log(`   Server identity: ${this.did}`);
          console.log(`   ⚠  Set SERVER_DID=${this.did} in your environment`);
        } else {
          throw err;
        }
      }
    }

    // Generate or load signing key for attestations and transfer JWTs
    await this.initSigningKey();

    // Publish server metadata record
    await this.publishServerRecord(config, serverName, serverDescription);
  }

  private async initSigningKey(): Promise<void> {
    // Generate an ephemeral signing key for this server instance
    // In production, this should be loaded from persistent storage
    this.signingKey = await Secp256k1Keypair.create({ exportable: true });

    // Convert to jose-compatible key for JWT operations (transfer tokens)
    await this.initJwtKey();
  }

  private async initJwtKey(): Promise<void> {
    const rawKey = await this.signingKey.export();
    this.jwtPrivateKey = await jose.importJWK({
      kty: "EC",
      crv: "secp256k1",
      d: Buffer.from(rawKey).toString("base64url"),
      x: Buffer.from(this.signingKey.publicKeyBytes().slice(1, 33)).toString("base64url"),
      y: Buffer.from(this.signingKey.publicKeyBytes().slice(33, 65)).toString("base64url"),
    }, "ES256K") as CryptoKey;
  }

  /**
   * Initialize just the signing key (without jose JWT key).
   * Used for testing attestation signing in isolation.
   */
  async initSigningKeyOnly(): Promise<void> {
    this.signingKey = await Secp256k1Keypair.create({ exportable: true });
  }

  private async publishServerRecord(config: AtProtoConfig, serverName: string, serverDescription: string): Promise<void> {
    try {
      await this.agent.com.atproto.repo.putRecord({
        repo: this.did,
        collection: NSID.WorldServer,
        rkey: "self",
        record: {
          $type: NSID.WorldServer,
          name: serverName,
          description: serverDescription,
          endpoint: `${config.publicUrl}/ws`,
          xrpcEndpoint: `${config.publicUrl}/xrpc`,
          createdAt: new Date().toISOString(),
        },
      });
      console.log("   Published server record to PDS");
    } catch (err) {
      console.warn("   Failed to publish server record:", err instanceof Error ? err.message : err);
    }
  }

  signTransferToken(payload: TransferPayload): Promise<string> {
    return new jose.SignJWT({
      characterHash: payload.characterHash,
      targetRoom: payload.targetRoom,
    })
      .setProtectedHeader({ alg: "ES256K" })
      .setIssuer(payload.iss)
      .setSubject(payload.sub)
      .setAudience(payload.aud)
      .setIssuedAt(payload.iat)
      .setExpirationTime(payload.exp)
      .sign(this.jwtPrivateKey);
  }

  async verifyTransferToken(jwt: string, expectedAudience: string): Promise<TransferPayload | null> {
    try {
      // For incoming transfers, we need to resolve the source server's public key
      // from their DID document. For now, we extract the unverified payload
      // and the full verification happens in the transfer handler.
      const { payload } = await jose.jwtVerify(jwt, this.jwtPrivateKey, {
        audience: expectedAudience,
      });

      return {
        iss: payload.iss ?? "",
        sub: payload.sub ?? "",
        aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0] ?? "",
        iat: payload.iat ?? 0,
        exp: payload.exp ?? 0,
        characterHash: (payload as Record<string, unknown>).characterHash as string,
        targetRoom: (payload as Record<string, unknown>).targetRoom as string,
      };
    } catch {
      return null;
    }
  }

  async signAttestation(playerDid: string, claims: AttestationClaims): Promise<SignedAttestation> {
    const attestation: SignedAttestation = {
      iss: this.did,
      sub: playerDid,
      iat: Math.floor(Date.now() / 1000),
      claims,
      sig: "",
    };

    // Sign the payload (excluding sig field) with the server's secp256k1 key
    const { sig: _, ...payload } = attestation;
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const sigBytes = await this.signingKey.sign(data);
    attestation.sig = Buffer.from(sigBytes).toString("base64url");

    return attestation;
  }

  /**
   * Verify an attestation signature against our own public key.
   * For cross-server verification, the source server's public key would be
   * resolved from its DID document. For now, verifies against our own key
   * (useful for round-trip tests and self-signed attestations).
   */
  async verifyAttestation(attestation: SignedAttestation): Promise<boolean> {
    try {
      const { sig, ...payload } = attestation;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const sigBytes = Buffer.from(sig, "base64url");
      return verifySig(this.signingKey.publicKeyBytes(), data, sigBytes);
    } catch {
      return false;
    }
  }

  getPublicKeyBytes(): Uint8Array {
    return this.signingKey.publicKeyBytes();
  }
}
