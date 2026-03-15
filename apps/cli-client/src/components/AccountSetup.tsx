import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { loadProfile, type SavedProfile } from "../connection/saved-profile.js";

type SetupPhase = "menu" | "signin" | "signup-pds" | "signup-handle" | "signup-email" | "signup-password" | "signup-creating";

interface Props {
  onComplete: (result: AccountResult) => void;
}

export interface AccountResult {
  mode: "oauth" | "dev";
  handle: string;
  did?: string;
  pdsUrl?: string;
}

const DEV_MODE = process.env.DEV_MODE === "true";

export function AccountSetup({ onComplete }: Props) {
  const savedProfile = loadProfile();
  const hasProfile = savedProfile && savedProfile.handle;

  const [phase, setPhase] = useState<SetupPhase>("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  // Signup state
  const [signupPds, setSignupPds] = useState("");
  const [signupHandle, setSignupHandle] = useState("");
  const [signupEmail, setSignupEmail] = useState("");

  const menuItems = [
    { label: "Sign in with existing account", value: "signin" as const },
    { label: "Create a new account", value: "signup" as const },
    ...(hasProfile
      ? [{ label: `Continue as ${savedProfile!.handle}`, value: "saved" as const }]
      : []),
    ...(DEV_MODE
      ? [{ label: "Quick connect (dev mode)", value: "dev" as const }]
      : []),
  ];

  useInput((input, key) => {
    if (phase === "menu") {
      if (key.upArrow) {
        setMenuIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setMenuIndex((i) => Math.min(menuItems.length - 1, i + 1));
      } else if (key.return) {
        const selected = menuItems[menuIndex];
        if (selected.value === "saved" && hasProfile) {
          onComplete({
            mode: "oauth",
            handle: savedProfile!.handle,
            did: savedProfile!.did,
            pdsUrl: savedProfile!.pdsUrl,
          });
        } else if (selected.value === "signin") {
          setPhase("signin");
          setInputValue("");
        } else if (selected.value === "signup") {
          setPhase("signup-pds");
          setInputValue("");
        } else if (selected.value === "dev") {
          // Dev mode: skip auth, just ask for name
          // Use a simple prompt — go straight to server select with dev flag
          onComplete({ mode: "dev", handle: `Adventurer_${Math.floor(Math.random() * 9999)}` });
        }
      }
      return;
    }

    if (phase === "signup-creating") return;

    // Text input phases — Esc goes back
    if (key.escape) {
      if (phase === "signin" || phase === "signup-pds") {
        setPhase("menu");
      } else if (phase === "signup-handle") {
        setPhase("signup-pds");
        setInputValue(signupPds);
      } else if (phase === "signup-email") {
        setPhase("signup-handle");
        setInputValue(signupHandle);
      } else if (phase === "signup-password") {
        setPhase("signup-email");
        setInputValue(signupEmail);
      }
      setError("");
      return;
    }

    if (key.return) {
      const trimmed = inputValue.trim();
      if (!trimmed) return;

      if (phase === "signin") {
        onComplete({ mode: "oauth", handle: trimmed });
        return;
      }

      if (phase === "signup-pds") {
        setSignupPds(trimmed);
        setInputValue("");
        setPhase("signup-handle");
        return;
      }

      if (phase === "signup-handle") {
        setSignupHandle(trimmed);
        setInputValue("");
        setPhase("signup-email");
        return;
      }

      if (phase === "signup-email") {
        setSignupEmail(trimmed);
        setInputValue("");
        setPhase("signup-password");
        return;
      }

      if (phase === "signup-password") {
        createAccount(trimmed);
        return;
      }
    }

    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputValue((prev) => prev + input);
    }
  });

  async function createAccount(password: string) {
    setPhase("signup-creating");
    setError("");

    let pdsBaseUrl = signupPds;
    if (!pdsBaseUrl.startsWith("http")) {
      pdsBaseUrl = `https://${pdsBaseUrl}`;
    }
    pdsBaseUrl = pdsBaseUrl.replace(/\/+$/, "");

    try {
      const res = await fetch(`${pdsBaseUrl}/xrpc/com.atproto.server.createAccount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: signupHandle.includes(".") ? signupHandle : `${signupHandle}.${new URL(pdsBaseUrl).hostname}`,
          email: signupEmail,
          password,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(errData.message ?? `Account creation failed (${res.status})`);
      }

      const data = await res.json() as { did: string; handle: string };

      onComplete({
        mode: "oauth",
        handle: data.handle,
        did: data.did,
        pdsUrl: pdsBaseUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
      setPhase("signup-password");
      setInputValue("");
    }
  }

  // ── Render ──

  if (phase === "menu") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Account Setup</Text>
        <Box height={1} />

        <Text>How would you like to connect?</Text>
        <Box height={1} />

        {menuItems.map((item, i) => (
          <Box key={item.value}>
            <Text color={i === menuIndex ? "cyan" : "white"}>
              {i === menuIndex ? " > " : "   "}
              {item.label}
            </Text>
          </Box>
        ))}

        <Box height={1} />
        <Text color="gray" dimColor>Use arrow keys to select, Enter to confirm</Text>
      </Box>
    );
  }

  if (phase === "signin") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Sign In</Text>
        <Box height={1} />

        <Text>Enter your AT Protocol handle or DID:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          e.g. yourname.bsky.social or yourname.your-server.com
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  if (phase === "signup-pds") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Create Account</Text>
        <Box height={1} />

        <Text>Enter the server's PDS address:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          This is the address of the server you want to create an account on.
        </Text>
        <Text color="gray" dimColor>
          e.g. pds.my-realm.com or localhost:2583
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  if (phase === "signup-handle") {
    const hostname = (() => {
      try { return new URL(signupPds.startsWith("http") ? signupPds : `https://${signupPds}`).hostname; }
      catch { return signupPds; }
    })();

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Create Account</Text>
        <Text color="gray" dimColor>PDS: {signupPds}</Text>
        <Box height={1} />

        <Text>Choose a handle:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        {inputValue && !inputValue.includes(".") ? (
          <Text color="gray" dimColor>  → {inputValue}.{hostname}</Text>
        ) : null}

        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  if (phase === "signup-email") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Create Account</Text>
        <Text color="gray" dimColor>PDS: {signupPds} | Handle: {signupHandle}</Text>
        <Box height={1} />

        <Text>Enter your email address:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  if (phase === "signup-password") {
    const masked = "•".repeat(inputValue.length);
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Create Account</Text>
        <Text color="gray" dimColor>PDS: {signupPds} | Handle: {signupHandle}</Text>
        <Box height={1} />

        <Text>Choose a password:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{masked}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        {error ? (
          <>
            <Box height={1} />
            <Text color="red">{error}</Text>
          </>
        ) : null}
        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  if (phase === "signup-creating") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Create Account</Text>
        <Box height={1} />
        <Text color="yellow">Creating account...</Text>
      </Box>
    );
  }

  return null;
}
