import type { Chain } from "../types";

const CHAIN_META: Record<Chain, { label: string; color: string; bg: string }> = {
  L1: { label: "GhostChain L1", color: "text-violet-400", bg: "bg-violet-950 border-violet-800" },
  L2: { label: "GhostL2",       color: "text-blue-400",   bg: "bg-blue-950 border-blue-800" },
  L3: { label: "GhostL3",       color: "text-teal-400",   bg: "bg-teal-950 border-teal-800" },
};

interface ChainBadgeProps {
  chain: Chain;
  className?: string;
  showLabel?: boolean;
}

export function ChainBadge({ chain, className = "", showLabel = true }: ChainBadgeProps) {
  const meta = CHAIN_META[chain];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        meta.bg,
        meta.color,
        className,
      ].join(" ")}
    >
      <span className={["w-1.5 h-1.5 rounded-full bg-current", meta.color].join(" ")} />
      {showLabel ? meta.label : chain}
    </span>
  );
}

interface ChainSelectorProps {
  value: Chain;
  onChange: (chain: Chain) => void;
  className?: string;
}

export function ChainSelector({ value, onChange, className = "" }: ChainSelectorProps) {
  return (
    <div className={["flex gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800", className].join(" ")}>
      {(["L1", "L2", "L3"] as Chain[]).map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={[
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            value === c
              ? `${CHAIN_META[c].bg} ${CHAIN_META[c].color} border`
              : "text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
