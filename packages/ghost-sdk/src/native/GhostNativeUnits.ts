/** Ghost-native unit constants (18 decimals, same as ethers) */
export const GhostWei  = 1n;
export const GhostGwei = 1_000_000_000n;
export const GhostOne  = 1_000_000_000_000_000_000n; // 10^18

export const GhostNativeUnits = {
  GhostWei,
  GhostGwei,
  GhostOne,

  /**
   * Parse a human-readable Ghost amount (e.g. "1.5") into GhostWei.
   *
   * @example
   *   GhostNativeUnits.parseGhost("1.5")  // 1500000000000000000n
   */
  parseGhost(amount: string): bigint {
    const [i, f = ""] = amount.trim().split(".");
    const frac = (f + "0".repeat(18)).slice(0, 18);
    return BigInt(i || "0") * GhostOne + BigInt(frac);
  },

  /**
   * Format GhostWei into human-readable Ghost string.
   *
   * @example
   *   GhostNativeUnits.formatGhost(1500000000000000000n)  // "1.5"
   */
  formatGhost(value: bigint): string {
    const sign = value < 0n ? "-" : "";
    const v = value < 0n ? -value : value;
    const i = v / GhostOne;
    const f = (v % GhostOne).toString().padStart(18, "0").replace(/0+$/, "");
    return f ? `${sign}${i}.${f}` : `${sign}${i}`;
  },

  parseGhostGwei(amount: string): bigint {
    const [i, f = ""] = amount.trim().split(".");
    const frac = (f + "0".repeat(9)).slice(0, 9);
    return BigInt(i || "0") * GhostGwei + BigInt(frac);
  },

  formatGhostGwei(value: bigint): string {
    const i = value / GhostGwei;
    const f = (value % GhostGwei).toString().padStart(9, "0").replace(/0+$/, "");
    return f ? `${i}.${f}` : `${i}`;
  },
} as const;
