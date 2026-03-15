import { useState, type KeyboardEvent } from "react";
import type { SavedProfile } from "../connection/profile-storage.js";
import "./pages.css";

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
  const [error, setError] = useState("");

  async function connectToServer(url: string) {
    setStatus("connecting");

    let baseUrl = url;
    if (!baseUrl.startsWith("http")) {
      baseUrl = `http://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    try {
      const res = await fetch(`${baseUrl}/info`);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const info = (await res.json()) as ServerInfo;
      onConnect(baseUrl, info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const trimmed = inputValue.trim();
      if (trimmed) connectToServer(trimmed);
    }
  }

  if (status === "connecting") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Server Connection</h2>
        <p style={{ color: "var(--color-yellow)" }}>Connecting to {inputValue}...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 style={{ color: "var(--color-cyan)" }}>Choose a Server</h2>
      <p>Enter server address:</p>

      <div className="page-input-row">
        <span className="input-prompt">&gt; </span>
        <input
          className="page-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
          placeholder="localhost:3000"
        />
        <button
          className="page-button"
          onClick={() => {
            const trimmed = inputValue.trim();
            if (trimmed) connectToServer(trimmed);
          }}
        >
          Connect
        </button>
      </div>

      {error ? (
        <div>
          <p style={{ color: "var(--color-red)" }}>{error}</p>
          <p className="dim" style={{ cursor: "pointer" }} onClick={() => setStatus("input")}>
            Click to try again
          </p>
        </div>
      ) : (
        <p className="dim">e.g. localhost:3000 or my-realm.example.com</p>
      )}
    </div>
  );
}
