"use client";
import type { AIEngineHealth } from "@/services/aiService";

interface Props {
  engines:  AIEngineHealth[];
  onAction?:(engineId: string, action: string) => void;
}

const GROUP_ICON: Record<string, string> = {
  growth:     "📣",
  economy:    "💰",
  governance: "🏛",
  infra:      "🔧",
  security:   "🔐",
  agents:     "🤖",
  dev:        "💻",
  evolution:  "🧬",
  planetary:  "🌍",
};

export function AIEngineStatusPanel({ engines, onAction }: Props) {
  const groups = engines.reduce<Record<string, AIEngineHealth[]>>((acc, e) => {
    (acc[e.group] ??= []).push(e);
    return acc;
  }, {});

  const onlineCount = engines.filter(e => e.status === "online").length;
  const total       = engines.length;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: "0.75rem" }}>
        <span className="section-title">AI Engine Fleet</span>
        <span className={`badge ${onlineCount === total ? "badge-green" : onlineCount > total * 0.7 ? "badge-yellow" : "badge-red"}`}>
          {onlineCount}/{total} online
        </span>
      </div>
      <div className="ai-panel">
        {Object.entries(groups).map(([group, list]) => (
          <div key={group} className="engine-group">
            <div className="engine-group-title">
              {GROUP_ICON[group] ?? "⚙️"} {group.toUpperCase()} — {list.filter(e => e.status === "online").length}/{list.length}
            </div>
            {list.map(eng => (
              <div key={eng.id} className="engine-row">
                <div className="engine-info">
                  <span className={`status-dot dot-${eng.status}`} />
                  <span className="engine-label">{eng.label}</span>
                  <span className="engine-port">:{eng.port}</span>
                </div>
                <div className="engine-meta">
                  {eng.latencyMs > 0 && <span className="meta-tag">{eng.latencyMs}ms</span>}
                  {eng.cycles != null && <span className="meta-tag">{eng.cycles} cycles</span>}
                </div>
                {onAction && eng.status === "online" && (
                  <button className="btn-mini" onClick={() => onAction(eng.id, "loop/run")}>▶ Run</button>
                )}
                {eng.status === "offline" && (
                  <span className="badge badge-red" style={{ fontSize: "0.65rem" }}>OFFLINE</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
