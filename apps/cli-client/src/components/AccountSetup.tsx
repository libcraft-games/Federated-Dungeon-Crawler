import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { loadProfile } from "../connection/saved-profile.js";

type SetupPhase =
  | "menu"
  | "signin"
  | "signup-server"
  | "signup-connecting"
  | "signup-handle"
  | "signup-email"
  | "signup-password"
  | "signup-creating";

interface Props {
  onComplete: (result: AccountResult) => void;
}

export interface AccountResult {
  mode: "oauth" | "dev";
  handle: string;
  did?: string;
  pdsUrl?: string;
  password?: string;
  /** If set, skip ServerSelect — the server is already known */
  serverUrl?: string;
  serverInfo?: { name: string; description: string; players: number; rooms: number };
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
  const [signupServerUrl, setSignupServerUrl] = useState("");
  const [pdsHostname, setPdsHostname] = useState("");
  const [serverInfo, setServerInfo] = useState<AccountResult["serverInfo"]>(undefined);
  const [signupHandle, setSignupHandle] = useState("");
  const [signupEmail, setSignupEmail] = useState("");

  const menuItems = [
    { label: "Sign in with existing account", value: "signin" as const },
    { label: "Create a new account", value: "signup" as const },
    ...(hasProfile
      ? [{ label: `Continue as ${savedProfile!.handle}`, value: "saved" as const }]
      : []),
    ...(DEV_MODE ? [{ label: "Quick connect (dev mode)", value: "dev" as const }] : []),
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
          setPhase("signup-server");
          setInputValue("");
        } else if (selected.value === "dev") {
          onComplete({ mode: "dev", handle: `Adventurer_${Math.floor(Math.random() * 9999)}` });
        }
      }
      return;
    }

    if (phase === "signup-creating" || phase === "signup-connecting") return;

    // Text input phases — Esc goes back
    if (key.escape) {
      if (phase === "signin" || phase === "signup-server") {
        setPhase("menu");
      } else if (phase === "signup-handle") {
        setPhase("signup-server");
        setInputValue(signupServerUrl);
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

      if (phase === "signup-server") {
        connectToServer(trimmed);
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

  async function connectToServer(address: string) {
    setPhase("signup-connecting");
    setError("");

    let baseUrl = address;
    if (!baseUrl.startsWith("http")) {
      baseUrl =
        baseUrl.includes("localhost") || baseUrl.match(/:\d+$/)
          ? `http://${baseUrl}`
          : `https://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    try {
      const res = await fetch(`${baseUrl}/info`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const info = (await res.json()) as {
        name: string;
        description: string;
        players: number;
        rooms: number;
        pdsHostname?: string;
      };

      setSignupServerUrl(baseUrl);
      setServerInfo({
        name: info.name,
        description: info.description,
        players: info.players,
        rooms: info.rooms,
      });
      setPdsHostname(info.pdsHostname ?? "");
      setInputValue("");
      setPhase("signup-handle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to server");
      setPhase("signup-server");
    }
  }

  async function createAccount(password: string) {
    setPhase("signup-creating");
    setError("");

    try {
      const res = await fetch(`${signupServerUrl}/auth/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: signupHandle,
          email: signupEmail,
          password,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `Account creation failed (${res.status})`);
      }

      const data = (await res.json()) as { did: string; handle: string };

      onComplete({
        mode: "oauth",
        handle: data.handle,
        did: data.did,
        password,
        serverUrl: signupServerUrl,
        serverInfo,
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
        <Text color="cyan" bold>
          Account Setup
        </Text>
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
        <Text color="gray" dimColor>
          Use arrow keys to select, Enter to confirm
        </Text>
      </Box>
    );
  }

  if (phase === "signin") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Sign In
        </Text>
        <Box height={1} />

        <Text>Enter your AT Protocol handle or DID:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>
            {"> "}
          </Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          e.g. yourname.bsky.social or yourname.your-server.com
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
        <Box height={1} />
        <Text color="gray" dimColor>
          Esc to go back
        </Text>
      </Box>
    );
  }

  if (phase === "signup-server") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Box height={1} />

        <Text>Enter the game server address:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>
            {"> "}
          </Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          e.g. realms.example.com or localhost:3000
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
        <Box height={1} />
        <Text color="gray" dimColor>
          Esc to go back
        </Text>
      </Box>
    );
  }

  if (phase === "signup-connecting") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Box height={1} />
        <Text color="yellow">Connecting to server...</Text>
      </Box>
    );
  }

  if (phase === "signup-handle") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Text color="gray" dimColor>
          Server: {serverInfo?.name ?? signupServerUrl}
        </Text>
        <Box height={1} />

        <Text>Choose a handle:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>
            {"> "}
          </Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        {inputValue && !inputValue.includes(".") && pdsHostname ? (
          <Text color="gray" dimColor>
            {" "}
            {inputValue}.{pdsHostname}
          </Text>
        ) : null}

        <Box height={1} />
        <Text color="gray" dimColor>
          Esc to go back
        </Text>
      </Box>
    );
  }

  if (phase === "signup-email") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Text color="gray" dimColor>
          Server: {serverInfo?.name ?? signupServerUrl} | Handle: {signupHandle}
        </Text>
        <Box height={1} />

        <Text>Enter your email address:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>
            {"> "}
          </Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          Esc to go back
        </Text>
      </Box>
    );
  }

  if (phase === "signup-password") {
    const masked = "\u2022".repeat(inputValue.length);
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Text color="gray" dimColor>
          Server: {serverInfo?.name ?? signupServerUrl} | Handle: {signupHandle}
        </Text>
        <Box height={1} />

        <Text>Choose a password:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>
            {"> "}
          </Text>
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
        <Text color="gray" dimColor>
          Esc to go back
        </Text>
      </Box>
    );
  }

  if (phase === "signup-creating") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Create Account
        </Text>
        <Box height={1} />
        <Text color="yellow">Creating account...</Text>
      </Box>
    );
  }

  return null;
}
