/**
 * bonding-curves.ts — Token bonding curve mathematics.
 *
 * Supports four curve shapes commonly used in GhostChain token launches:
 *
 *   LINEAR      — p(s) = a + b·s            (simple, predictable)
 *   EXPONENTIAL — p(s) = a · e^(k·s)        (aggressive growth)
 *   LOGARITHMIC — p(s) = a + b·ln(1 + s)    (decelerating, stable)
 *   SIGMOID     — p(s) = max / (1 + e^(-k·(s-mid)))  (S-curve, capped)
 *
 * Collateral functions integrate the price curve to find the total collateral
 * required to mint tokens from supply `s0` to `s1`.
 *
 * All values are in floating-point (JS number) — convert to BigInt token units
 * using `toTokenUnits()` from amm-math.ts before on-chain use.
 */

export type CurveType = "linear" | "exponential" | "logarithmic" | "sigmoid";

// ── Curve parameter interfaces ────────────────────────────────────────────────

export interface LinearCurveParams {
  type: "linear";
  initialPrice: number; // a: price at supply = 0
  slope: number;        // b: price increase per token
}

export interface ExponentialCurveParams {
  type: "exponential";
  initialPrice: number; // a
  growthRate: number;   // k (per token, e.g. 0.000001 for gradual growth)
}

export interface LogarithmicCurveParams {
  type: "logarithmic";
  initialPrice: number; // a
  scale: number;        // b (steepness)
}

export interface SigmoidCurveParams {
  type: "sigmoid";
  maxPrice: number;  // asymptote
  midpoint: number;  // supply where price = maxPrice / 2
  steepness: number; // k — how sharp the S-curve inflects
}

export type BondingCurveParams =
  | LinearCurveParams
  | ExponentialCurveParams
  | LogarithmicCurveParams
  | SigmoidCurveParams;

// ── Point-in-time price ────────────────────────────────────────────────────────

/**
 * Returns the marginal price at a given supply level.
 */
export function priceAt(supply: number, curve: BondingCurveParams): number {
  switch (curve.type) {
    case "linear":
      return curve.initialPrice + curve.slope * supply;

    case "exponential":
      return curve.initialPrice * Math.exp(curve.growthRate * supply);

    case "logarithmic":
      return curve.initialPrice + curve.scale * Math.log(1 + supply);

    case "sigmoid": {
      const exponent = -curve.steepness * (supply - curve.midpoint);
      return curve.maxPrice / (1 + Math.exp(exponent));
    }
  }
}

// ── Collateral (integral of price curve from s0 → s1) ─────────────────────────

/**
 * Total collateral required to mint from supply `s0` to `s1`.
 * Uses closed-form integrals where available, trapezoidal approximation otherwise.
 */
export function collateralRequired(
  s0: number,
  s1: number,
  curve: BondingCurveParams,
  steps = 1_000,
): number {
  if (s1 <= s0) return 0;

  switch (curve.type) {
    case "linear": {
      // ∫(a + b·s)ds from s0 to s1 = a(s1-s0) + b/2·(s1²-s0²)
      const ds = s1 - s0;
      return curve.initialPrice * ds + (curve.slope / 2) * (s1 * s1 - s0 * s0);
    }

    case "exponential": {
      // ∫a·e^(k·s)ds = a/k · (e^(k·s1) - e^(k·s0))
      const k = curve.growthRate;
      if (k === 0) return curve.initialPrice * (s1 - s0);
      return (curve.initialPrice / k) * (Math.exp(k * s1) - Math.exp(k * s0));
    }

    case "logarithmic": {
      // ∫(a + b·ln(1+s))ds = a(s1-s0) + b·[(s1+1)ln(s1+1)-(s1+1) - ((s0+1)ln(s0+1)-(s0+1))]
      const antideriv = (s: number) =>
        curve.initialPrice * s + curve.scale * ((s + 1) * Math.log(s + 1) - (s + 1));
      return antideriv(s1) - antideriv(s0);
    }

    case "sigmoid": {
      // No clean closed form — use trapezoidal integration
      const step = (s1 - s0) / steps;
      let total  = 0;
      for (let i = 0; i < steps; i++) {
        const lo = s0 + i * step;
        const hi = lo + step;
        total += (priceAt(lo, curve) + priceAt(hi, curve)) / 2 * step;
      }
      return total;
    }
  }
}

/**
 * Collateral returned when burning from supply `s1` back to `s0`.
 * Equal to collateral required from s0 → s1 (symmetric by definition).
 */
export function collateralReturned(s0: number, s1: number, curve: BondingCurveParams): number {
  return collateralRequired(s0, s1, curve);
}

// ── Supply discovery ──────────────────────────────────────────────────────────

/**
 * Binary-search for the supply level reachable by spending `collateral`
 * starting from current supply `s0`. Tolerance: 0.01% relative error.
 */
export function supplyForCollateral(
  s0: number,
  collateral: number,
  curve: BondingCurveParams,
  maxSupply = 1e12,
  maxIter = 64,
): number {
  let lo = s0;
  let hi = maxSupply;
  for (let i = 0; i < maxIter; i++) {
    const mid  = (lo + hi) / 2;
    const cost = collateralRequired(s0, mid, curve);
    if (Math.abs(cost - collateral) / collateral < 0.0001) return mid;
    if (cost < collateral) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

export interface CurvePoint { supply: number; price: number; }

/**
 * Sample `points` evenly-spaced price points from supply 0 → maxSupply.
 * Useful for rendering a chart in the Next.js UI.
 */
export function sampleCurve(
  curve: BondingCurveParams,
  maxSupply: number,
  points = 200,
): CurvePoint[] {
  const step = maxSupply / points;
  return Array.from({ length: points + 1 }, (_, i) => {
    const supply = i * step;
    return { supply, price: priceAt(supply, curve) };
  });
}
