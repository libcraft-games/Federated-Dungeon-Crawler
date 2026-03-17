import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { loadProfile, type SavedProfile } from "../connection/profile-storage.js";
import "./pages.css";

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

interface Props {
  onComplete: (result: AccountResult) => void;
}

type SetupPhase =
  | "menu"
  | "signin"
  | "signup-server"
  | "signup-connecting"
  | "signup-handle"
  | "signup-email"
  | "signup-password"
  | "signup-creating";

export function AccountSetup({ onComplete }: Props) {
  const savedProfile = loadProfile();
  const hasProfile = savedProfile && savedProfile.handle;

  const [phase, setPhase] = useState<SetupPhase>("menu");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const currentOrigin = window.location.origin;
  const signupAutoTried = useRef(false);

  // Signup state
  const [signupServerUrl, setSignupServerUrl] = useState("");
  const [pdsHostname, setPdsHostname] = useState("");
  const [serverInfo, setServerInfo] = useState<AccountResult["serverInfo"]>(undefined);
  const [signupHandle, setSignupHandle] = useState("");
  const [signupEmail, setSignupEmail] = useState("");

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCurrentPhase();
    }
    if (e.key === "Escape") {
      goBack();
    }
  }

  function submitCurrentPhase() {
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

  function goBack() {
    setError("");
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
  }

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

  // -- Render --

  if (phase === "menu") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Account Setup</h2>
        <p className="dim">How would you like to connect?</p>

        <div className="account-menu">
          <button
            className="account-menu-item"
            onClick={() => {
              setInputValue("");
              setPhase("signin");
            }}
          >
            <span style={{ color: "var(--color-green)" }}>Sign in</span>
            <span className="dim">with an existing AT Proto account</span>
          </button>

          <button
            className="account-menu-item"
            onClick={() => {
              // Auto-connect to current origin if on a real domain
              if (currentOrigin && !currentOrigin.includes("localhost:5173")) {
                connectToServer(currentOrigin);
              } else {
                setInputValue("");
                setPhase("signup-server");
              }
            }}
          >
            <span style={{ color: "var(--color-cyan)" }}>Create account</span>
            <span className="dim">register a new account on a server</span>
          </button>

          {hasProfile && (
            <button
              className="account-menu-item"
              onClick={() => {
                onComplete({
                  mode: "oauth",
                  handle: savedProfile!.handle,
                  did: savedProfile!.did,
                  pdsUrl: savedProfile!.pdsUrl,
                });
              }}
            >
              <span style={{ color: "var(--color-yellow)" }}>
                Continue as {savedProfile!.handle}
              </span>
              <span className="dim">use saved profile</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "signin") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Sign In</h2>
        <p>Enter your AT Protocol handle or DID:</p>

        <div className="page-input-row">
          <span className="input-prompt">&gt; </span>
          <input
            className="page-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            spellCheck={false}
            placeholder="yourname.bsky.social"
          />
          <button className="page-button page-button-primary" onClick={submitCurrentPhase}>
            Sign In
          </button>
        </div>

        <p className="dim">e.g. yourname.bsky.social or yourname.your-server.com</p>
        {error && <p style={{ color: "var(--color-red)" }}>{error}</p>}
        <button className="page-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "signup-server") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p>Enter the game server address:</p>

        <div className="page-input-row">
          <span className="input-prompt">&gt; </span>
          <input
            className="page-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            spellCheck={false}
            placeholder={currentOrigin}
          />
          <button className="page-button page-button-primary" onClick={submitCurrentPhase}>
            Connect
          </button>
        </div>

        <p className="dim">e.g. {currentOrigin} or another-realm.example.com</p>
        {error && <p style={{ color: "var(--color-red)" }}>{error}</p>}
        <button className="page-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "signup-connecting") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p style={{ color: "var(--color-yellow)" }}>Connecting to server...</p>
      </div>
    );
  }

  if (phase === "signup-handle") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p className="dim">Server: {serverInfo?.name ?? signupServerUrl}</p>
        <p>Choose a handle:</p>

        <div className="page-input-row">
          <span className="input-prompt">&gt; </span>
          <input
            className="page-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            spellCheck={false}
            placeholder="yourname"
          />
          <button className="page-button page-button-primary" onClick={submitCurrentPhase}>
            Next
          </button>
        </div>

        {inputValue && !inputValue.includes(".") && pdsHostname && (
          <p className="dim">
            {inputValue}.{pdsHostname}
          </p>
        )}
        <button className="page-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "signup-email") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p className="dim">
          Server: {serverInfo?.name ?? signupServerUrl} | Handle: {signupHandle}
        </p>
        <p>Enter your email address:</p>

        <div className="page-input-row">
          <span className="input-prompt">&gt; </span>
          <input
            className="page-input"
            type="email"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            spellCheck={false}
            placeholder="you@example.com"
          />
          <button className="page-button page-button-primary" onClick={submitCurrentPhase}>
            Next
          </button>
        </div>

        <button className="page-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "signup-password") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p className="dim">
          Server: {serverInfo?.name ?? signupServerUrl} | Handle: {signupHandle}
        </p>
        <p>Choose a password:</p>

        <div className="page-input-row">
          <span className="input-prompt">&gt; </span>
          <input
            className="page-input"
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
          />
          <button className="page-button page-button-primary" onClick={submitCurrentPhase}>
            Create
          </button>
        </div>

        {error && <p style={{ color: "var(--color-red)" }}>{error}</p>}
        <button className="page-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "signup-creating") {
    return (
      <div className="page-container">
        <h2 style={{ color: "var(--color-cyan)" }}>Create Account</h2>
        <p style={{ color: "var(--color-yellow)" }}>Creating account...</p>
      </div>
    );
  }

  return null;
}
