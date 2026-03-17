import type { QuestEntry } from "../hooks/use-game-state.js";
import "./HintBar.css";

interface Props {
  infoPanelOpen?: boolean;
  quests?: QuestEntry[];
  onToggleInfo?: () => void;
  onCommand?: (cmd: string) => void;
}

export function HintBar({ infoPanelOpen, quests, onToggleInfo, onCommand }: Props) {
  const activeQuest = quests?.[0];
  const currentObj = activeQuest?.objectives.find((o) => !o.done);
  const questHint =
    activeQuest && currentObj
      ? `${activeQuest.questName}: ${currentObj.description}${currentObj.required > 1 ? ` (${currentObj.current}/${currentObj.required})` : ""}`
      : null;

  return (
    <div className="hint-bar">
      <span className="hint" onClick={onToggleInfo}>
        <span className="hint-key">Tab</span>
        <span className="dim">{infoPanelOpen ? " Close Panel" : " Info Panel"}</span>
      </span>
      <span className="hint-sep">|</span>
      <span className="hint" onClick={() => onCommand?.("map")}>
        <span className="hint-key">map</span>
      </span>
      <span className="hint-sep">|</span>
      <span className="hint" onClick={() => onCommand?.("look")}>
        <span className="hint-key">look</span>
      </span>
      <span className="hint-sep">|</span>
      <span className="hint" onClick={() => onCommand?.("help")}>
        <span className="hint-key">help</span>
      </span>
      {questHint && (
        <>
          <span className="hint-sep">|</span>
          <span style={{ color: "var(--color-yellow)" }}>{"\u2691"} </span>
          <span className="dim">{questHint}</span>
        </>
      )}
    </div>
  );
}
