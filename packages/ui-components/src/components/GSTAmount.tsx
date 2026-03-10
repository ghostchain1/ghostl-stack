import type { GSTAmountProps } from "../types";

const GST_UNIT = BigInt("1000000000000000000"); // 1e18

function formatGST(raw: bigint | string | number, decimals: number): string {
  const bn = typeof raw === "bigint" ? raw : BigInt(String(raw).split(".")[0]);
  const whole = bn / GST_UNIT;
  const frac = bn % GST_UNIT;
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
  return decimals > 0 ? `${whole}.${fracStr}` : whole.toString();
}

export function GSTAmount({
  amount,
  decimals = 6,
  showSymbol = true,
  className = "",
}: GSTAmountProps) {
  const formatted = formatGST(amount, decimals);
  return (
    <span className={["font-mono tabular-nums", className].join(" ")}>
      {formatted}
      {showSymbol && <span className="ml-1 text-violet-400 text-xs font-semibold">GST</span>}
    </span>
  );
}
