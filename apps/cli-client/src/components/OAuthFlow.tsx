import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

export interface OAuthResult {
  sessionId?: string;
  websocketUrl?: string;
  did?: string;
  needsCharacter?: boolean;
  gameSystem?: unknown;
  /** Pass password through so App can use /auth/session for character creation */
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
        const res = await fetch(
          `${serverUrl}/auth/login?handle=${encodeURIComponent(handle)}`,
        );
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

        const { exec } = await import("child_process");
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        exec(`${openCmd} "${url}"`);
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
        const res = await fetch(
          `${serverUrl}/auth/poll?ticket=${encodeURIComponent(ticket)}`,
        );
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

  // Password input handling
  useInput((input, key) => {
    if (phase !== "password-prompt") return;

    if (key.return) {
      if (!passwordInput) return;
      submitPassword(passwordInput);
      return;
    }

    if (key.backspace || key.delete) {
      setPasswordInput((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setPasswordInput((prev) => prev + input);
    }
  });

  async function submitPassword(password: string) {
    setPhase("password-auth");
    setPasswordError("");

    try {
      const res = await fetch(`${serverUrl}/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, password }),
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
        password,
      });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Login failed");
      setPasswordInput("");
      setPhase("password-prompt");
    }
  }

  const masked = "\u2022".repeat(passwordInput.length);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>
        Sign In
      </Text>
      <Box height={1} />

      {phase === "starting" && (
        <Text color="yellow">Starting authentication for {handle}...</Text>
      )}

      {phase === "waiting" && (
        <>
          <Text color="green">
            A browser window has been opened for authentication.
          </Text>
          <Box height={1} />
          <Text>
            Please authorize Federated Realms in your browser, then return here.
          </Text>
          <Box height={1} />
          <Text color="gray" dimColor>
            Waiting for authorization...
          </Text>
        </>
      )}

      {phase === "password-prompt" && (
        <>
          <Text>Enter password for {handle}:</Text>
          <Box height={1} />
          <Box>
            <Text color="green" bold>
              {"> "}
            </Text>
            <Text>{masked}</Text>
            <Text color="gray">{"\u2588"}</Text>
          </Box>
          {passwordError ? (
            <>
              <Box height={1} />
              <Text color="red">{passwordError}</Text>
            </>
          ) : null}
        </>
      )}

      {phase === "password-auth" && (
        <Text color="yellow">Authenticating...</Text>
      )}

      {phase === "error" && (
        <>
          <Text color="red">Authentication failed: {error}</Text>
          <Box height={1} />
          <Text color="gray" dimColor>
            Try running the server with DEV_MODE=true for local development.
          </Text>
        </>
      )}

      {phase === "complete" && (
        <Text color="green">Authentication successful! Connecting...</Text>
      )}
    </Box>
  );
}
