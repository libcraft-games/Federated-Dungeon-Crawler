import type { GameState } from "../hooks/use-game-state.js";
import "./StatusBar.css";

interface Props {
  state: GameState;
  playerName: string;
  connecting?: boolean;
}

function hpColor(hp: number, max: number): string {
  if (hp <= max * 0.25) return "var(--color-hp-low)";
  if (hp <= max * 0.5) return "var(--color-hp-mid)";
  return "var(--color-hp-high)";
}

function StatGauge({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  return (
    <span className="stat-gauge">
      <span className="dim">{label} </span>
      <span style={{ color, fontWeight: "bold" }}>{current}</span>
      <span className="dim">/{max}</span>
    </span>
  );
}

export function StatusBar({ state, playerName, connecting }: Props) {
  const { room, connected, serverName, stats } = state;

  if (!connected) {
    return (
      <div
        className="status-bar"
        style={{ borderColor: connecting ? "var(--color-yellow)" : "var(--color-red)" }}
      >
        <span style={{ color: connecting ? "var(--color-yellow)" : "var(--color-red)" }}>
          {connecting ? "Connecting..." : "Disconnected"}
        </span>
      </div>
    );
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="player-name">{playerName}</span>
        {stats && <span className="dim"> [Lv {stats.level}]</span>}
        <span className="dim"> | </span>
        <span className="room-title">{room?.title ?? "..."}</span>
      </div>
      <div className="status-right">
        {stats && (
          <>
            <StatGauge
              label="HP"
              current={stats.hp}
              max={stats.maxHp}
              color={hpColor(stats.hp, stats.maxHp)}
            />
            <StatGauge label="MP" current={stats.mp} max={stats.maxMp} color="var(--color-mp)" />
            <StatGauge label="AP" current={stats.ap} max={stats.maxAp} color="var(--color-ap)" />
            <span className="stat-gauge">
              <span className="dim">G </span>
              <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{stats.gold}</span>
            </span>
          </>
        )}
        <span className="dim">{serverName ?? ""}</span>
      </div>
    </div>
  );
}
