import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { loadProfile, type SavedProfile } from "../connection/saved-profile.js";

type SetupPhase = "menu" | "signin" | "create" | "dev";

interface Props {
  onComplete: (result: AccountResult) => void;
}

export interface AccountResult {
  mode: "oauth" | "dev";
  handle: string;
  did?: string;
  pdsUrl?: string;
}

export function AccountSetup({ onComplete }: Props) {
  const savedProfile = loadProfile();
  const hasProfile = savedProfile && savedProfile.handle;

  const [phase, setPhase] = useState<SetupPhase>("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [inputField, setInputField] = useState<"handle" | "pds" | "server">("handle");
  const [pdsUrl, setPdsUrl] = useState("");
  const [error, setError] = useState("");

  const menuItems = [
    { label: "Sign in with existing account", value: "signin" as const },
    { label: "Quick connect (dev mode)", value: "dev" as const },
    ...(hasProfile
      ? [{ label: `Continue as ${savedProfile!.handle}`, value: "saved" as const }]
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
          setInputField("handle");
          setInputValue("");
        } else if (selected.value === "dev") {
          setPhase("dev");
          setInputField("handle");
          setInputValue("");
        }
      }
      return;
    }

    // Text input phases
    if (key.escape) {
      setPhase("menu");
      setInputValue("");
      setError("");
      return;
    }

    if (key.return) {
      const trimmed = inputValue.trim();
      if (!trimmed) return;

      if (phase === "signin") {
        // For OAuth sign-in, we just need the handle
        onComplete({ mode: "oauth", handle: trimmed });
        return;
      }

      if (phase === "dev") {
        // Dev mode: just a display name
        onComplete({ mode: "dev", handle: trimmed });
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

  if (phase === "dev") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Quick Connect</Text>
        <Box height={1} />

        <Text>Enter a character name:</Text>
        <Box height={1} />

        <Box>
          <Text color="green" bold>{"> "}</Text>
          <Text>{inputValue}</Text>
          <Text color="gray">{"█"}</Text>
        </Box>

        <Box height={1} />
        <Text color="gray" dimColor>
          Connects directly without AT Protocol authentication
        </Text>
        <Box height={1} />
        <Text color="gray" dimColor>Esc to go back</Text>
      </Box>
    );
  }

  return null;
}
