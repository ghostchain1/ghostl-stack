/**
 * GhostBrain — Load Balancer
 *
 * Scores available execution targets (VMs, Docker hosts, servers) by
 * composite load and selects the best target for a new workload placement.
 * Also produces rebalance recommendations when the cluster is skewed.
 *
 * Load score = CPU% × 0.45 + MEM% × 0.40 + DISK% × 0.15
 * (lower = more capacity available)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoadTarget {
  id:          string;
  type:        "vm" | "docker_host" | "hypervisor" | "server";
  url?:        string;    // optional — for remote targets
  cpuPercent:  number;
  memPercent:  number;
  diskPercent: number;
  weight:      number;    // 1 = normal; >1 = preferred; 0 = excluded
}

export interface TargetScore {
  target:    LoadTarget;
  loadScore: number;      // 0–100, lower = more available
  available: boolean;     // false if score > SATURATED_THRESHOLD
}

export interface RebalanceRecommendation {
  source:   string;   // overloaded target id
  dest:     string;   // least-loaded target id
  urgency:  "low" | "medium" | "high";
  reason:   string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const W_CPU   = 0.45;
const W_MEM   = 0.40;
const W_DISK  = 0.15;
const SATURATED_THRESHOLD = Number(process.env.LB_SATURATED_THRESHOLD ?? "85");
const REBALANCE_SKEW      = Number(process.env.LB_REBALANCE_SKEW      ?? "30");

// ── State ─────────────────────────────────────────────────────────────────────

const _targets = new Map<string, LoadTarget>();

// ── Core functions ────────────────────────────────────────────────────────────

function computeLoad(t: LoadTarget): number {
  return (t.cpuPercent * W_CPU + t.memPercent * W_MEM + t.diskPercent * W_DISK) / t.weight;
}

/** Register or update a load target. */
export function upsertTarget(target: LoadTarget): void {
  _targets.set(target.id, target);
}

/** Remove a target (e.g., taken offline). */
export function removeTarget(id: string): void {
  _targets.delete(id);
}

/** Score all registered targets. */
export function scoreTargets(): TargetScore[] {
  return [..._targets.values()].map(t => ({
    target:    t,
    loadScore: +computeLoad(t).toFixed(2),
    available: computeLoad(t) < SATURATED_THRESHOLD,
  })).sort((a, b) => a.loadScore - b.loadScore);
}

/** Select the best available target for new workload placement. */
export function selectBestTarget(type?: LoadTarget["type"]): TargetScore | null {
  const scored = scoreTargets().filter(s => s.available && (!type || s.target.type === type));
  return scored[0] ?? null;
}

/**
 * Generate rebalance recommendations when the cluster is skewed.
 * Called by the kernel brain on each observe cycle.
 */
export function computeRebalanceRecs(): RebalanceRecommendation[] {
  const scored = scoreTargets();
  if (scored.length < 2) return [];

  const recs: RebalanceRecommendation[] = [];
  const overloaded  = scored.filter(s => s.loadScore > SATURATED_THRESHOLD);
  const underloaded = scored.filter(s => s.loadScore < SATURATED_THRESHOLD - REBALANCE_SKEW);

  for (const src of overloaded) {
    const dest = underloaded[0];
    if (!dest) continue;
    const urgency: RebalanceRecommendation["urgency"] =
      src.loadScore >= 95 ? "high" : src.loadScore >= 85 ? "medium" : "low";
    recs.push({
      source:  src.target.id,
      dest:    dest.target.id,
      urgency,
      reason:  `source load ${src.loadScore.toFixed(0)}% vs dest ${dest.loadScore.toFixed(0)}%`,
    });
  }
  return recs;
}

/** Stats snapshot for observability. */
export function lbStats(): { targets: number; overloaded: number; available: number } {
  const scored = scoreTargets();
  return {
    targets:    scored.length,
    overloaded: scored.filter(s => !s.available).length,
    available:  scored.filter(s => s.available).length,
  };
}
