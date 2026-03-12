"use client";

interface MetricCardProps {
  title: string;
  value: string | number | undefined | null;
  sub?: string;
  color?: string;
  onClick?: () => void;
  href?: string;
}

export function MetricCard({ title, value, sub, color, onClick, href }: MetricCardProps) {
  const content = (
    <>
      <div className="card-title">{title}</div>
      <div className="card-value" style={color ? { color } : undefined}>
        {value ?? "—"}
      </div>
      {sub && <div className="card-sub">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <a href={href} className="card card-link" style={{ textDecoration: "none" }}>
        {content}
      </a>
    );
  }

  return (
    <div className="card" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      {content}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  sub?: string;
  live?: boolean;
}

export function SectionHeader({ title, sub, live }: SectionHeaderProps) {
  return (
    <div className="page-header">
      <h1>
        {title}
        {live && <span className="live-dot" style={{ marginLeft: "0.5rem" }} />}
      </h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
