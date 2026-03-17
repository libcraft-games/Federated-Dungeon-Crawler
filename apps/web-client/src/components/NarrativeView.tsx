import { useRef, useEffect } from "react";
import type { NarrativeLine } from "../hooks/use-game-state.js";
import "./NarrativeView.css";

const STYLE_COLORS: Record<string, string> = {
  info: "var(--color-info)",
  error: "var(--color-error)",
  combat: "var(--color-combat)",
  system: "var(--color-system)",
  chat: "var(--color-chat)",
  room: "var(--color-room)",
};

interface Props {
  lines: NarrativeLine[];
}

export function NarrativeView({ lines }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  // Track if user is at bottom before update
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 30;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  return (
    <div className="narrative-view" ref={containerRef} onScroll={handleScroll}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`narrative-line ${line.style === "room" ? "bold" : ""}`}
          style={{ color: STYLE_COLORS[line.style] ?? "var(--text)" }}
        >
          {line.text || "\u00A0"}
        </div>
      ))}
    </div>
  );
}
