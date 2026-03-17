import type { GameState } from "../hooks/use-game-state.js";
import { SLOT_LABELS, hpLevel, viewportMap } from "@realms/client-common";
import "./InfoPanel.css";

interface Props {
  state: GameState;
  playerName: string;
}

const HP_COLORS: Record<string, string> = {
  high: "var(--color-hp-high)",
  mid: "var(--color-hp-mid)",
  low: "var(--color-hp-low)",
};

function hpColor(hp: number, max: number): string {
  return HP_COLORS[hpLevel(hp, max)];
}

function Bar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round(Math.min(current / max, 1) * 100) : 0;
  return (
    <div className="info-bar">
      <div className="info-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function InfoPanel({ state, playerName }: Props) {
  const { stats, inventory, equipment, map } = state;

  return (
    <div className="info-panel panel" style={{ borderColor: "var(--color-magenta)" }}>
      {/* Character Stats */}
      <div className="info-column">
        <div className="panel-header" style={{ color: "var(--color-magenta)" }}>
          Character
        </div>
        {stats ? (
          <>
            <div>
              <span className="player-name">{playerName}</span>
              <span className="dim"> — Level </span>
              <span className="bold">{stats.level}</span>
            </div>
            <div className="stat-row">
              <span className="dim stat-label">HP</span>
              <Bar current={stats.hp} max={stats.maxHp} color={hpColor(stats.hp, stats.maxHp)} />
              <span style={{ color: hpColor(stats.hp, stats.maxHp), fontWeight: "bold" }}>
                {stats.hp}
              </span>
              <span className="dim">/{stats.maxHp}</span>
            </div>
            <div className="stat-row">
              <span className="dim stat-label">MP</span>
              <Bar current={stats.mp} max={stats.maxMp} color="var(--color-mp)" />
              <span style={{ color: "var(--color-mp)", fontWeight: "bold" }}>{stats.mp}</span>
              <span className="dim">/{stats.maxMp}</span>
            </div>
            <div className="stat-row">
              <span className="dim stat-label">AP</span>
              <Bar current={stats.ap} max={stats.maxAp} color="var(--color-ap)" />
              <span style={{ color: "var(--color-ap)", fontWeight: "bold" }}>{stats.ap}</span>
              <span className="dim">/{stats.maxAp}</span>
            </div>
            <div className="stat-row">
              <span className="dim stat-label">XP</span>
              <Bar current={stats.xp} max={stats.xp + stats.xpToNext} color="var(--color-xp)" />
              <span style={{ color: "var(--color-xp)" }}>{stats.xpToNext}</span>
              <span className="dim"> to next</span>
            </div>
          </>
        ) : (
          <span className="dim">No stats yet.</span>
        )}
      </div>

      <div className="info-divider" />

      {/* Inventory */}
      <div className="info-column">
        <div className="panel-header" style={{ color: "var(--color-magenta)" }}>
          Inventory
        </div>
        {inventory.length > 0 ? (
          inventory.slice(0, 8).map((item, i) => (
            <div key={i}>
              {item.name}
              {item.quantity > 1 && <span className="dim"> (x{item.quantity})</span>}
            </div>
          ))
        ) : (
          <span className="dim">Empty</span>
        )}
        {inventory.length > 8 && <span className="dim">+{inventory.length - 8} more</span>}
      </div>

      <div className="info-divider" />

      {/* Equipment */}
      <div className="info-column">
        <div className="panel-header" style={{ color: "var(--color-magenta)" }}>
          Gear
        </div>
        {Object.keys(equipment).length > 0 ? (
          Object.entries(equipment)
            .slice(0, 8)
            .map(([slot, item]) => (
              <div key={slot}>
                <span className="dim">{(SLOT_LABELS[slot] ?? slot).padEnd(4)} </span>
                {item.name}
              </div>
            ))
        ) : (
          <span className="dim">None</span>
        )}
      </div>

      <div className="info-divider" />

      {/* Map */}
      <div className="info-column info-column-grow">
        <div className="panel-header" style={{ color: "var(--color-magenta)" }}>
          Map <span className="dim">[@]=you [+]=visited</span>
        </div>
        {map ? (
          <pre className="minimap">{viewportMap(map, 30, 7).join("\n")}</pre>
        ) : (
          <span className="dim">Explore to reveal.</span>
        )}
      </div>
    </div>
  );
}
