import { useEffect, useState, useRef } from "react";
import "./pages.css";

export interface OAuthResult {
  sessionId?: string;
  websocketUrl?: string;
  did?: string;
  needsCharacter?: boolean;
  gameSystem?: unknown;
  password?: string;
}

interface Props {
  handle: string;
  serverUrl: string;
  onComplete: (result: OAuthResult) => void;
}

type FlowPhase =
  | "starting"
  | "waiting"
  | "password-prompt"
  | "password-auth"
  | "complete"
  | "error";

export function OAuthFlow({ handle, serverUrl, onComplete }: Props) {
  const [phase, setPhase] = useState<FlowPhase>("starting");
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const started = useRef(false);

  // Start the OAuth flow
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch(`${serverUrl}/auth/login?handle=${encodeURIComponent(handle)}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Login failed (${res.status})`);
        }

        const { url, ticket: t } = (await res.json()) as {
          url: string;
          ticket: string;
        };
        setTicket(t);
        setPhase("waiting");

        // Open OAuth URL in new tab/popup
        window.open(url, "_blank", "noopener");
      } catch {
        // OAuth unavailable — fall back to password auth
        setPhase("password-prompt");
      }
    })();
  }, [handle, serverUrl]);

  // Poll for OAuth result
  useEffect(() => {
    if (phase !== "waiting" || !ticket) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${serverUrl}/auth/poll?ticket=${encodeURIComponent(ticket)}`);
        if (!res.ok) return;

        const data = (await res.json()) as {
          status: string;
          sessionId?: string;
          websocketUrl?: string;
          did?: string;
          needsCharacter?: boolean;
          gameSystem?: unknown;
          error?: string;
        };

        if (data.status === "pending") return;

        clearInterval(interval);

        if (data.status === "error") {
          setError(data.error ?? "Authentication failed");
          setPhase("error");
          return;
        }

        setPhase("complete");
        onComplete({
          sessionId: data.sessionId,
          websocketUrl: data.websocketUrl,
          did: data.did,
          needsCharacter: data.needsCharacter,
          gameSystem: data.gameSystem,
        });
      } catch {
        // Network error — keep polling
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [phase, ticket, serverUrl, onComplete]);

  async function submitPassword() {
    if (!passwordInput) return;
    setPhase("password-auth");
    setPasswordError("");

    try {
      const res = await fetch(`${serverUrl}/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, password: passwordInput }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Login failed (${res.status})`);
      }

      const data = (await res.json()) as {
        sessionId?: string;
        did?: string;
        needsCharacter?: boolean;
        gameSystem?: unknown;
      };

      setPhase("complete");
      onComplete({
        sessionId: data.sessionId,
        did: data.did,
        needsCharacter: data.needsCharacter,
        gameSystem: data.gameSystem,
        password: passwordInput,
      });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Login failed");
      setPasswordInput("");
      setPhase("password-prompt");
    }
  }

  return (
    <div className="page-container">
      <h2 style={{ color: "var(--color-cyan)" }}>Sign In</h2>

      {phase === "starting" && (
        <p style={{ color: "var(--color-yellow)" }}>Starting authentication for {handle}...</p>
      )}

      {phase === "waiting" && (
        <>
          <p style={{ color: "var(--color-green)" }}>
            A new window has been opened for authentication.
          </p>
          <p>Please authorize Federated Realms in your browser, then return here.</p>
          <p className="dim">Waiting for authorization...</p>
          <button className="page-button" onClick={() => setPhase("password-prompt")}>
            Use password instead
          </button>
        </>
      )}

      {phase === "password-prompt" && (
        <>
          <p>Enter password for {handle}:</p>
          <div className="page-input-row">
            <span className="input-prompt">&gt; </span>
            <input
              className="page-input"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPassword();
              }}
              autoFocus
            />
            <button className="page-button page-button-primary" onClick={submitPassword}>
              Sign In
            </button>
          </div>
          {passwordError && <p style={{ color: "var(--color-red)" }}>{passwordError}</p>}
        </>
      )}

      {phase === "password-auth" && (
        <p style={{ color: "var(--color-yellow)" }}>Authenticating...</p>
      )}

      {phase === "error" && (
        <>
          <p style={{ color: "var(--color-red)" }}>Authentication failed: {error}</p>
          <button
            className="page-button"
            onClick={() => {
              setPasswordInput("");
              setPhase("password-prompt");
            }}
          >
            Try password login
          </button>
        </>
      )}

      {phase === "complete" && (
        <p style={{ color: "var(--color-green)" }}>Authentication successful! Connecting...</p>
      )}
    </div>
  );
}
