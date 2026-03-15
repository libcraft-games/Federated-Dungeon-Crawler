import type { RoomState } from "@realms/common";
import "./RoomPanel.css";

interface Props {
  room: RoomState;
  playerName: string;
  onCommand?: (cmd: string) => void;
}

export function RoomPanel({ room, playerName, onCommand }: Props) {
  const otherPlayers = room.players.filter((p) => p.name !== playerName);
  const safeTag = room.flags.includes("safe") ? " [safe]" : "";

  return (
    <div className="room-panel panel">
      <div className="room-title">{room.title}</div>
      <div className="room-description">{room.description.trim()}</div>
      <div className="room-info">
        <div className="room-entities">
          {otherPlayers.length > 0 && (
            <span className="entity-group">
              Players:{" "}
              {otherPlayers.map((p, i) => (
                <span key={p.name}>
                  {i > 0 && ", "}
                  <span className="entity-link" onClick={() => onCommand?.(`look ${p.name}`)}>
                    {p.name}
                  </span>
                </span>
              ))}
            </span>
          )}
          {room.npcs.length > 0 && (
            <span className="entity-group">
              NPCs:{" "}
              {room.npcs.map((n, i) => (
                <span key={n.name + i}>
                  {i > 0 && ", "}
                  <span className="entity-link" onClick={() => onCommand?.(`look ${n.name}`)}>
                    {n.name}
                  </span>
                </span>
              ))}
            </span>
          )}
          {room.items.length > 0 && (
            <span className="entity-group">
              Items:{" "}
              {room.items.map((item, i) => {
                const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
                return (
                  <span key={item.name + i}>
                    {i > 0 && ", "}
                    <span className="entity-link" onClick={() => onCommand?.(`take ${item.name}`)}>
                      {item.name}
                      {qty}
                    </span>
                  </span>
                );
              })}
            </span>
          )}
          {otherPlayers.length === 0 && room.npcs.length === 0 && room.items.length === 0 && (
            <span className="dim">Nothing of note here.</span>
          )}
        </div>
        <div className="room-exits">
          <span className="dim">Exits: </span>
          {room.exits.map((e, i) => (
            <span key={e.direction}>
              {i > 0 && ", "}
              <span className="exit-link" onClick={() => onCommand?.(e.direction)}>
                {e.direction}
              </span>
            </span>
          ))}
          {safeTag && <span style={{ color: "var(--color-cyan)" }}>{safeTag}</span>}
        </div>
      </div>
    </div>
  );
}
