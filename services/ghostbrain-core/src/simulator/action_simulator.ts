/**
 * GhostBrain Infrastructure Simulator — Action Delta Model
 *
 * Pure-function simulation engine: given a current SimState and a proposed
 * SimAction, computes the predicted SimState after the action completes.
 *
 * Design principles:
 *   - No I/O, no side effects — results are fully deterministic from inputs.
 *   - Conservative estimates: when uncertain, bias toward higher resource usage.
 *   - Chain routing law preserved: L3→L2→L1.  Killing an L2 node is modelled
 *     as also degrading L3 connectivity (L3 traffic can no longer settle).
 *
 * Delta models are deliberately simple (no ML) so that:
 *   a) They are auditable: reasons can be fully explained.
 *   b) They run in <1 ms with no external dependencies.
 *   c) They fail safely: if a delta is unknown → confidence 0, verdict block.
 */

import type {
  SimAction,
  SimState,
  SimContainerState,
  SimRisk,
} from "./sim_model.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Estimated CPU spike on host during a container restart (percent-points). */
const RESTART_CPU_SPIKE_PCT  = 12;
/** How long a typical chain-node container restart takes (ms). */
const CHAIN_RESTART_DELTA_MS = 45_000;
/** How long a non-chain container restart takes (ms). */
const PLAIN_RESTART_DELTA_MS = 15_000;
/** CPU overhead added by Docker in the first 10 s after an unthrottle. */
const UNTHROTTLE_BURST_PCT   = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Shallow-clone the host + containers from a state (chain state reference OK). */
function cloneState(s: SimState): SimState {
  return {
    timestamp: Date.now(),
    host:      { ...s.host },
    containers: Object.fromEntries(
      Object.entries(s.containers).map(([k, v]) => [k, { ...v }])
    ),
    chains: {
      l1: { ...s.chains.l1 },
      l2: { ...s.chains.l2 },
      l3: { ...s.chains.l3 },
    },
  };
}

/**
 * Map container -> chain layer from its name.
 * Convention: ghostchain|ghost-l1 → l1, ghostl2 → l2, ghostl3 → l3.
 */
function detectChainLayer(name: string): "l1" | "l2" | "l3" | undefined {
  const n = name.toLowerCase();
  if (n.includes("ghostchain") || n.includes("ghost-l1") || n.includes("ghostl1")) return "l1";
  if (n.includes("ghostl2") || n.includes("ghost-l2")) return "l2";
  if (n.includes("ghostl3") || n.includes("ghost-l3")) return "l3";
  return undefined;
}

// ── Delta models by action type ───────────────────────────────────────────────

interface DeltaResult {
  postState:  SimState;
  deltaMs:    number;
  confidence: number;
  risks:      SimRisk[];
}

function simulateRestartContainer(pre: SimState, action: SimAction): DeltaResult {
  const post    = cloneState(pre);
  const target  = post.containers[action.targetId];
  const layer   = detectChainLayer(action.targetId);
  const isChain = !!layer;
  const risks: SimRisk[] = [];

  // ── Post-state modelling ─────────────────────────────────────────────────
  if (target) {
    // During restart: container is briefly offline
    target.alive = false;

    // Host CPU spikes during restart; memory temporarily freed
    const freedMb = target.memUsageMb;
    post.host.cpuPct  = clamp(pre.host.cpuPct  + RESTART_CPU_SPIKE_PCT, 0, 100);
    post.host.memPct  = clamp(
      pre.host.memPct - (freedMb / pre.host.memTotalMb) * 100,
      0, 100,
    );
  }

  // ── Chain routing impact ─────────────────────────────────────────────────
  if (layer) {
    post.chains[layer].alive = false;
    // L3→L2→L1 law: if L2 goes offline, L3 cannot settle (degraded, not dead)
    if (layer === "l2") {
      risks.push({
        category:    "chain_downtime",
        probability: 0.95,
        severity:    "high",
        description: "L2 restart will sever L3→L2 settlement path temporarily.",
      });
    }
    if (layer === "l1") {
      // L1 offline = catastrophic: nothing can settle
      post.chains.l2.alive = false;
      post.chains.l3.alive = false;
      risks.push({
        category:    "chain_downtime",
        probability: 1.0,
        severity:    "critical",
        description: "L1 restart halts all chain settlement (L2 and L3 cannot finalize).",
      });
    }
    risks.push({
      category:    "chain_downtime",
      probability: 0.9,
      severity:    layer === "l1" ? "critical" : layer === "l2" ? "high" : "medium",
      description: `${layer.toUpperCase()} container offline during restart (~${CHAIN_RESTART_DELTA_MS / 1000}s).`,
    });
  }

  // ── CPU overload from restart spike ────────────────────────────────────
  if (post.host.cpuPct > 90) {
    risks.push({
      category:    "cpu_overload",
      probability: 0.7,
      severity:    post.host.cpuPct > 95 ? "critical" : "high",
      description: `Host CPU may peak at ~${Math.round(post.host.cpuPct)}% during restart.`,
    });
  }

  return {
    postState:  post,
    deltaMs:    isChain ? CHAIN_RESTART_DELTA_MS : PLAIN_RESTART_DELTA_MS,
    confidence: target ? 75 : 40,   // lower if container not in tracked state
    risks,
  };
}

function simulateThrottleCpu(pre: SimState, action: SimAction): DeltaResult {
  const post   = cloneState(pre);
  const target = post.containers[action.targetId];
  const risks: SimRisk[] = [];
  const newLimit = action.params?.cpuLimitPercent ?? 50;

  if (target) {
    target.cpuLimitPct = newLimit;
    // If new limit < current usage → container will be throttled (CPU starved)
    if (newLimit < target.cpuPct * 0.9) {
      const layer = detectChainLayer(action.targetId);
      if (layer) {
        risks.push({
          category:    "chain_downtime",
          probability: 0.6,
          severity:    layer === "l1" ? "high" : "medium",
          description: `CPU throttle below current usage may stall ${layer.toUpperCase()} block production.`,
        });
      }
    }
  }

  return {
    postState:  post,
    deltaMs:    500,
    confidence: 85,
    risks,
  };
}

function simulateThrottleMem(pre: SimState, action: SimAction): DeltaResult {
  const post    = cloneState(pre);
  const target  = post.containers[action.targetId];
  const risks: SimRisk[] = [];
  const newLimitMb = action.params?.memLimitMb ?? 512;

  if (target) {
    const oldLimitMb = target.memLimitMb || (pre.host.memTotalMb * 0.8);

    // If limit < current usage → OOM kill
    if (newLimitMb < target.memUsageMb) {
      const layer = detectChainLayer(action.targetId);
      risks.push({
        category:    "memory_oom",
        probability: 0.95,
        severity:    "critical",
        description: `New limit (${newLimitMb} MB) < current usage (${Math.round(target.memUsageMb)} MB) — OOM kill likely.`,
      });
      if (layer) {
        post.chains[layer].alive = false;
        risks.push({
          category:    "chain_downtime",
          probability: 0.95,
          severity:    layer === "l1" ? "critical" : "high",
          description: `OOM kill of ${layer.toUpperCase()} node will halt chain finality.`,
        });
      }
    }

    // Update predicted state
    const deltaLimitMb = oldLimitMb - newLimitMb;
    target.memLimitMb  = newLimitMb;
    target.memPct      = Math.min(100, (target.memUsageMb / newLimitMb) * 100);
    // Host mem freed by the delta in limit (conservative: freed only if limit was binding)
    post.host.memPct   = clamp(
      pre.host.memPct - (Math.max(0, deltaLimitMb) / pre.host.memTotalMb) * 100,
      0, 100,
    );
  }

  return {
    postState:  post,
    deltaMs:    300,
    confidence: target ? 80 : 35,
    risks,
  };
}

function simulateEvictContainer(pre: SimState, action: SimAction): DeltaResult {
  const post   = cloneState(pre);
  const target = post.containers[action.targetId];
  const layer  = detectChainLayer(action.targetId);
  const risks: SimRisk[] = [];

  if (target) {
    target.alive = false;
    const freedMb    = target.memUsageMb;
    post.host.memPct = clamp(
      pre.host.memPct - (freedMb / pre.host.memTotalMb) * 100,
      0, 100,
    );
  }

  if (layer) {
    post.chains[layer].alive = false;
    risks.push({
      category:    "chain_downtime",
      probability: 1.0,
      severity:    "critical",
      description: `Evicting ${layer.toUpperCase()} node will permanently halt chain finality until manually restarted.`,
    });
    if (layer === "l1") {
      post.chains.l2.alive = false;
      post.chains.l3.alive = false;
      risks.push({
        category:    "cascade_failure",
        probability: 1.0,
        severity:    "critical",
        description: "L1 eviction cascades: L2 and L3 cannot finalize blocks.",
      });
    }
  }

  risks.push({
    category:    "data_loss",
    probability: 0.4,
    severity:    "high",
    description: "Forceful eviction may cause in-flight data loss for pending transactions.",
  });

  return {
    postState:  post,
    deltaMs:    5_000,
    confidence: 90,
    risks,
  };
}

function simulateAdjustVmMemory(pre: SimState, action: SimAction): DeltaResult {
  const post       = cloneState(pre);
  const newLimitMb = action.params?.memLimitMb ?? 2048;
  const risks: SimRisk[] = [];

  // Represent the VM as a pseudo-container keyed by targetId
  const vm = post.containers[action.targetId];
  if (vm) {
    if (newLimitMb < vm.memUsageMb) {
      risks.push({
        category:    "memory_oom",
        probability: 0.85,
        severity:    "critical",
        description: `VM memory reduced below usage (${Math.round(vm.memUsageMb)} MB used vs ${newLimitMb} MB new limit).`,
      });
    }
    const deltaLimitMb = vm.memLimitMb - newLimitMb;
    post.host.memPct   = clamp(
      pre.host.memPct + (-deltaLimitMb / pre.host.memTotalMb) * 100,
      0, 100,
    );
    vm.memLimitMb = newLimitMb;
    vm.memPct     = Math.min(100, (vm.memUsageMb / newLimitMb) * 100);
  }

  return {
    postState:  post,
    deltaMs:    2_000,
    confidence: vm ? 70 : 30,
    risks,
  };
}

function simulateUnthrottle(pre: SimState, action: SimAction): DeltaResult {
  const post   = cloneState(pre);
  const target = post.containers[action.targetId];
  const risks: SimRisk[] = [];

  if (target) {
    target.cpuLimitPct = 0; // unlimited
    target.memLimitMb  = 0;
    // Burst after unthrottle
    post.host.cpuPct = clamp(pre.host.cpuPct + UNTHROTTLE_BURST_PCT, 0, 100);
  }

  if (post.host.cpuPct > 85) {
    risks.push({
      category:    "cpu_overload",
      probability: 0.5,
      severity:    "medium",
      description: `Removing throttle may cause host CPU burst to ~${Math.round(post.host.cpuPct)}%.`,
    });
  }

  return { postState: post, deltaMs: 200, confidence: 70, risks };
}

function simulateFlushCache(pre: SimState, _action: SimAction): DeltaResult {
  const post = cloneState(pre);
  // Flushing cache frees ~10% of current memory on average
  post.host.memPct = clamp(pre.host.memPct - 10, 0, 100);
  return { postState: post, deltaMs: 1_000, confidence: 60, risks: [] };
}

function simulateMigrateWorkload(pre: SimState, _action: SimAction): DeltaResult {
  // Migration is complex and cross-node; we model local impact only
  const post = cloneState(pre);
  // Conservative: CPU spike from serialisation + network copy
  post.host.cpuPct = clamp(pre.host.cpuPct + 20, 0, 100);
  const risks: SimRisk[] = [];
  if (post.host.cpuPct > 90) {
    risks.push({
      category:    "cpu_overload",
      probability: 0.6,
      severity:    "high",
      description: "Workload migration may spike local CPU due to serialisation overhead.",
    });
  }
  return {
    postState:  post,
    deltaMs:    60_000,
    confidence: 50,   // cross-node model is inherently uncertain
    risks,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Simulate the effect of `action` on `preState`.
 * Returns DeltaResult without modifying preState.
 */
export function simulateAction(preState: SimState, action: SimAction): DeltaResult {
  switch (action.type) {
    case "restart_container":      return simulateRestartContainer(preState, action);
    case "throttle_container_cpu": return simulateThrottleCpu(preState, action);
    case "throttle_container_mem": return simulateThrottleMem(preState, action);
    case "evict_container":        return simulateEvictContainer(preState, action);
    case "adjust_vm_memory":       return simulateAdjustVmMemory(preState, action);
    case "unthrottle_container":   return simulateUnthrottle(preState, action);
    case "flush_cache":            return simulateFlushCache(preState, action);
    case "migrate_workload":       return simulateMigrateWorkload(preState, action);
    case "noop":
      return {
        postState:  cloneState(preState),
        deltaMs:    0,
        confidence: 100,
        risks:      [],
      };
    default: {
      // Unknown action type — fail safe
      const unknown: never = action.type;
      return {
        postState:  cloneState(preState),
        deltaMs:    0,
        confidence: 0,
        risks: [{
          category:    "cascade_failure",
          probability: 1,
          severity:    "critical",
          description: `Unknown action type "${String(unknown)}" — cannot simulate.`,
        }],
      };
    }
  }
}
