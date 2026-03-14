/**
 * GhostBrain — Threshold Monitor
 *
 * Checks a snapshot of current resource metrics against configured
 * thresholds. Returns threshold breaches with severity and recommended
 * action type, ready for the auto-recovery module to act on.
 *
 * Thresholds (all configurable via env):
 *   CPU_WARN   = 75%   CPU_CRIT  = 90%
 *   MEM_WARN   = 80%   MEM_CRIT  = 92%
 *   DISK_WARN  = 80%   DISK_CRIT = 90%
 */

export type ThresholdSeverity = "warn" | "crit";
export type ThresholdMetric   = "cpu" | "memory" | "disk" | "iowait" | "swap";
export type ThresholdAction   = "throttle" | "scale_memory" | "expand_disk" | "alert" | "none";

export interface ThresholdBreach {
  resourceId: string;
  metric:     ThresholdMetric;
  value:      number;
  threshold:  number;
  severity:   ThresholdSeverity;
  action:     ThresholdAction;
  ts:         number;
}

export interface ResourceSnapshot {
  resourceId:    string;
  cpuPercent:    number;
  memPercent:    number;
  diskPercent?:  number;
  iowaitPercent?: number;
  swapUsedMb?:   number;
  swapTotalMb?:  number;
}

// ── Configurable thresholds ───────────────────────────────────────────────────

const T = {
  CPU_WARN:   Number(process.env.THRESHOLD_CPU_WARN   ?? "75"),
  CPU_CRIT:   Number(process.env.THRESHOLD_CPU_CRIT   ?? "90"),
  MEM_WARN:   Number(process.env.THRESHOLD_MEM_WARN   ?? "80"),
  MEM_CRIT:   Number(process.env.THRESHOLD_MEM_CRIT   ?? "92"),
  DISK_WARN:  Number(process.env.THRESHOLD_DISK_WARN  ?? "80"),
  DISK_CRIT:  Number(process.env.THRESHOLD_DISK_CRIT  ?? "90"),
  IOWAIT_WARN: Number(process.env.THRESHOLD_IOWAIT    ?? "40"),
  SWAP_WARN_MB: Number(process.env.THRESHOLD_SWAP_MB  ?? "512"),
};

// ── Core check ────────────────────────────────────────────────────────────────

/**
 * Evaluate a resource snapshot and return any threshold breaches.
 * Multiple breaches per resource are possible (e.g., both CPU + MEM).
 */
export function checkThresholds(snap: ResourceSnapshot): ThresholdBreach[] {
  const breaches: ThresholdBreach[] = [];
  const ts = Date.now();

  // ── CPU ──────────────────────────────────────────────────────────────────
  if (snap.cpuPercent >= T.CPU_CRIT) {
    breaches.push({ resourceId: snap.resourceId, metric: "cpu", value: snap.cpuPercent,
      threshold: T.CPU_CRIT, severity: "crit", action: "throttle", ts });
  } else if (snap.cpuPercent >= T.CPU_WARN) {
    breaches.push({ resourceId: snap.resourceId, metric: "cpu", value: snap.cpuPercent,
      threshold: T.CPU_WARN, severity: "warn", action: "alert", ts });
  }

  // ── Memory ───────────────────────────────────────────────────────────────
  if (snap.memPercent >= T.MEM_CRIT) {
    breaches.push({ resourceId: snap.resourceId, metric: "memory", value: snap.memPercent,
      threshold: T.MEM_CRIT, severity: "crit", action: "scale_memory", ts });
  } else if (snap.memPercent >= T.MEM_WARN) {
    breaches.push({ resourceId: snap.resourceId, metric: "memory", value: snap.memPercent,
      threshold: T.MEM_WARN, severity: "warn", action: "scale_memory", ts });
  }

  // ── Disk ─────────────────────────────────────────────────────────────────
  const disk = snap.diskPercent ?? 0;
  if (disk >= T.DISK_CRIT) {
    breaches.push({ resourceId: snap.resourceId, metric: "disk", value: disk,
      threshold: T.DISK_CRIT, severity: "crit", action: "expand_disk", ts });
  } else if (disk >= T.DISK_WARN) {
    breaches.push({ resourceId: snap.resourceId, metric: "disk", value: disk,
      threshold: T.DISK_WARN, severity: "warn", action: "alert", ts });
  }

  // ── I/O wait ─────────────────────────────────────────────────────────────
  const iowait = snap.iowaitPercent ?? 0;
  if (iowait >= T.IOWAIT_WARN) {
    breaches.push({ resourceId: snap.resourceId, metric: "iowait", value: iowait,
      threshold: T.IOWAIT_WARN, severity: "warn", action: "alert", ts });
  }

  // ── Swap ─────────────────────────────────────────────────────────────────
  if ((snap.swapUsedMb ?? 0) >= T.SWAP_WARN_MB) {
    breaches.push({ resourceId: snap.resourceId, metric: "swap", value: snap.swapUsedMb ?? 0,
      threshold: T.SWAP_WARN_MB, severity: "warn", action: "scale_memory", ts });
  }

  return breaches;
}

/** Batch-check a list of resource snapshots. */
export function checkAll(snaps: ResourceSnapshot[]): ThresholdBreach[] {
  return snaps.flatMap(checkThresholds);
}

/** Expose thresholds config for observability. */
export function getThresholdConfig(): typeof T { return { ...T }; }
