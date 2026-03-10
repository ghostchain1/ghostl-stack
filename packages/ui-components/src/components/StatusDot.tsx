interface StatusDotProps {
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  label?: string;
  className?: string;
}

const STATUS_COLORS: Record<StatusDotProps["status"], string> = {
  healthy:   "bg-emerald-500",
  degraded:  "bg-amber-500",
  unhealthy: "bg-red-500",
  unknown:   "bg-zinc-500",
};

export function StatusDot({ status, label, className = "" }: StatusDotProps) {
  return (
    <span className={["inline-flex items-center gap-2 text-sm", className].join(" ")}>
      <span
        className={[
          "inline-block w-2 h-2 rounded-full",
          STATUS_COLORS[status],
          status === "healthy" ? "animate-pulse" : "",
        ].join(" ")}
      />
      {label ?? status}
    </span>
  );
}
