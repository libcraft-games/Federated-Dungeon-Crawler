import { useState, useRef, type KeyboardEvent } from "react";
import "./InputBar.css";

interface Props {
  onSubmit: (input: string) => void;
}

export function InputBar({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setHistory((prev) => [...prev.slice(-50), trimmed]);
        setHistoryIndex(-1);
      }
      setValue("");
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setValue(history[newIndex]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setValue("");
      } else {
        setHistoryIndex(newIndex);
        setValue(history[newIndex]);
      }
      return;
    }

    if (e.key === "Escape") {
      setValue("");
      setHistoryIndex(-1);
    }
  }

  return (
    <div className="input-bar" onClick={() => inputRef.current?.focus()}>
      <span className="input-prompt">&gt; </span>
      <input
        ref={inputRef}
        className="input-field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
