import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SavedProfile } from "../connection/saved-profile.js";

interface ServerInfo {
  name: string;
  description: string;
  players: number;
  rooms: number;
}

interface Props {
  savedProfile?: SavedProfile | null;
  onConnect: (serverUrl: string, serverInfo: ServerInfo) => void;
}

export function ServerSelect({ savedProfile, onConnect }: Props) {
  const [inputValue, setInputValue] = useState(savedProfile?.lastServer ?? "");
  const [status, setStatus] = useState<"input" | "connecting" | "error">("input");
  const [, setServerInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState("");

  useInput((input, key) => {
    if (status === "connecting") return;

    if (status === "error") {
      // Any key returns to input
      setStatus("input");
      setError("");
      return;
    }

    if (key.return) {
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      connectToServer(trimmed);
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.escape) {
      setInputValue("");
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputValue((prev) => prev + input);
    }
  });

  async function connectToServer(url: string) {
    setStatus("connecting");

    // Normalize URL
    let baseUrl = url;
    if (!baseUrl.startsWith("http")) {
      baseUrl = `http://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    try {
      const res = await fetch(`${baseUrl}/info`);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const info = (await res.json()) as ServerInfo;
      setServerInfo(info);
      onConnect(baseUrl, info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
    }
  }

  if (status === "connecting") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          Server Connection
        </Text>
        <Box height={1} />
        <Text color="yellow">Connecting to {inputValue}...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>
        Choose a Server
      </Text>
      <Box height={1} />

      <Text>Enter server address:</Text>
      <Box height={1} />

      <Box>
        <Text color="green" bold>
          {"> "}
        </Text>
        <Text>{inputValue}</Text>
        <Text color="gray">{"█"}</Text>
      </Box>

      <Box height={1} />

      {error ? (
        <>
          <Text color="red">{error}</Text>
          <Text color="gray" dimColor>
            Press any key to try again
          </Text>
        </>
      ) : (
        <Text color="gray" dimColor>
          e.g. localhost:3000 or my-realm.example.com
        </Text>
      )}
    </Box>
  );
}
