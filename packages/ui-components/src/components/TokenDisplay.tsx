interface TokenDisplayProps {
  symbol?: string;
  name?: string;
  amount?: string | bigint;
  icon?: React.ReactNode;
  className?: string;
}

export function TokenDisplay({
  symbol = "GST",
  name = "GhostChain Token",
  amount,
  icon,
  className = "",
}: TokenDisplayProps) {
  return (
    <div className={["flex items-center gap-3", className].join(" ")}>
      <div className="w-9 h-9 rounded-full bg-violet-950 border border-violet-800 flex items-center justify-center text-violet-400 text-xs font-bold">
        {icon ?? symbol.slice(0, 2)}
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-200">{symbol}</div>
        <div className="text-xs text-zinc-500">{name}</div>
      </div>
      {amount !== undefined && (
        <div className="ml-auto font-mono text-sm text-zinc-200 tabular-nums">{String(amount)}</div>
      )}
    </div>
  );
}
