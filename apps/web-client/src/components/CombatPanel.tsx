import type { CombatState } from "../hooks/use-game-state.js";
import "./CombatPanel.css";

interface Props {
  combat: CombatState;
  onCommand?: (cmd: string) => void;
}

function EnemyBar({
  name,
  level,
  hp,
  maxHp,
  isTarget,
  onClick,
}: {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  isTarget: boolean;
  onClick?: () => void;
}) {
  const ratio = maxHp > 0 ? Math.min(hp / maxHp, 1) : 0;
  const pct = Math.round(ratio * 100);
  const barColor =
    ratio <= 0.25
      ? "var(--color-hp-low)"
      : ratio <= 0.5
        ? "var(--color-hp-mid)"
        : "var(--color-hp-high)";

  return (
    <div className={`enemy-bar ${isTarget ? "enemy-target" : ""}`} onClick={onClick}>
      <span className="enemy-marker">{isTarget ? ">" : "\u00A0"}</span>
      <span className="enemy-name">{name}</span>
      <span className="dim"> (Lv.{level}) </span>
      <div className="hp-bar">
        <div className="hp-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span style={{ color: barColor, fontWeight: "bold" }}> {hp}</span>
      <span className="dim">/{maxHp}</span>
    </div>
  );
}

export function CombatPanel({ combat, onCommand }: Props) {
  const { combatants, targetId } = combat;
  const target = combatants.find((c) => c.id === targetId) ?? combatants[0];

  const hasArt = target?.art && target.art.length > 0;
  const artLines = hasArt ? target.art!.slice(0, 6) : [];
  const desc = target?.description?.trim().split("\n")[0] ?? "";

  return (
    <div className="combat-panel panel" style={{ borderColor: "var(--color-red)" }}>
      <div className="combat-header">
        <span style={{ color: "var(--color-red)", fontWeight: "bold" }}>COMBAT</span>
        <div className="combat-actions">
          {["attack", "defend", "cast", "flee", "use"].map((a) => (
            <span key={a} className="combat-action" onClick={() => onCommand?.(a)}>
              {a}
            </span>
          ))}
        </div>
      </div>

      {combatants.map((c) => (
        <EnemyBar
          key={c.id}
          name={c.name}
          level={c.level}
          hp={c.hp}
          maxHp={c.maxHp}
          isTarget={c.id === targetId}
          onClick={() => onCommand?.(`target ${c.name}`)}
        />
      ))}

      {(hasArt || desc) && (
        <div className="combat-detail">
          {hasArt && <pre className="combat-art">{artLines.join("\n")}</pre>}
          {desc && <span className="dim">{desc}</span>}
        </div>
      )}
    </div>
  );
}
