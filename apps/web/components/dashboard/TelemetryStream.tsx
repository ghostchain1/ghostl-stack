"use client";
/**
 * TelemetryStream — live event feed using the useTelemetry WebSocket hook.
 * Shows a scrollable table of real-time telemetry events with connection state.
 */

import { useTelemetry } from "@/lib/useTelemetry";
import { LiveDot } from "@/components/dashboard/StatusBadge";

interface TelemetryStreamProps {
  url?: string;
  maxVisible?: number;
  title?: string;
}

export function TelemetryStream({
  url,
  maxVisible = 25,
  title = "Live Telemetry",
}: TelemetryStreamProps) {
  const wsUrl = url ?? (
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:9300/ws/telemetry`
      : "ws://localhost:9300/ws/telemetry"
  );

  const { events, connected, error, clearEvents } = useTelemetry({
    url: wsUrl,
  });

  const visible = events.slice(-maxVisible).reverse();

  return (
    <div className="telemetry-stream">
      <div className="telemetry-header">
        <span className="telemetry-title">
          {connected ? <LiveDot /> : <span className="dot dot-red" />}
          {" "}{title}
        </span>
        <span className="telemetry-status">
          {connected
            ? `Connected · ${events.length} events`
            : error
              ? `Error: ${error}`
              : "Connecting…"}
        </span>
        {events.length > 0 && (
          <button className="cmd-btn" onClick={clearEvents} style={{ marginLeft: "auto" }}>
            Clear
          </button>
        )}
      </div>

      <div className="telemetry-table-wrap">
        {visible.length === 0 ? (
          <div className="telemetry-empty">
            {connected ? "Waiting for events…" : "Not connected"}
          </div>
        ) : (
          <table className="service-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Source</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ev) => (
                <tr key={`${ev.ts}-${ev.source}-${ev.type}`}>
                  <td className="telemetry-ts">
                    {new Date(ev.ts).toLocaleTimeString()}
                  </td>
                  <td>
                    <span className={`badge ${severityClass(ev.type)}`}>
                      {ev.type}
                    </span>
                  </td>
                  <td className="text-muted">{ev.source}</td>
                  <td className="telemetry-payload">
                    {typeof ev.payload === "string"
                      ? ev.payload
                      : JSON.stringify(ev.payload).slice(0, 120)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function severityClass(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("error") || t.includes("critical") || t.includes("alert"))
    return "badge-red";
  if (t.includes("warn"))
    return "badge-yellow";
  return "badge-green";
}
