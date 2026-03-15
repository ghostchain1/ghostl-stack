"use client";

interface StatusBadgeProps {
  ok: boolean;
  onLabel?: string;
  offLabel?: string;
}

export function StatusBadge({ ok, onLabel = "Online", offLabel = "Offline" }: StatusBadgeProps) {
  return ok
    ? <span className="badge badge-green"><span className="dot" />{onLabel}</span>
    : <span className="badge badge-red"><span className="dot" />{offLabel}</span>;
}

type SeverityLevel = "info" | "warning" | "critical" | "emergency" | "low" | "medium" | "high" | string;

export function SeverityBadge({ level }: { level: SeverityLevel }) {
  const cls = level === "critical" || level === "emergency" || level === "high"
    ? "badge-red"
    : level === "warning" || level === "medium"
    ? "badge-yellow"
    : "badge-green";
  return <span className={`badge ${cls}`}><span className="dot" />{level}</span>;
}

export function LiveDot() {
  return <span className="live-dot" title="Live data" />;
}
