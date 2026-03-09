/**
 * Scaling Policy
 *
 * Defines CPU/memory thresholds that trigger scale-up or scale-down proposals.
 * Scale actions are always proposals — they require human ratification.
 */

export const SCALING_POLICY = {
  /** CPU load (1-min average as fraction of vCPUs) above which scale-up is proposed. */
  CPU_SCALE_UP_THRESHOLD: parseFloat(process.env.SCALE_CPU_UP    ?? "0.80"),
  /** CPU load below which scale-down is considered. */
  CPU_SCALE_DOWN_THRESHOLD: parseFloat(process.env.SCALE_CPU_DOWN ?? "0.20"),

  /** Memory used % above which scale-up is proposed. */
  MEM_SCALE_UP_PCT: parseInt(process.env.SCALE_MEM_UP   ?? "85", 10),
  /** Memory used % below which idle scale-down is considered. */
  MEM_SCALE_DOWN_PCT: parseInt(process.env.SCALE_MEM_DOWN ?? "30", 10),

  /** Minimum cycles between scale proposals (anti-thrash). */
  MIN_SCALE_INTERVAL_CYCLES: 10,

  /** Docker image name for additional RPC nodes (must pass security policy). */
  RPC_NODE_IMAGE: process.env.RPC_NODE_IMAGE ?? "ghost-rpc-node",

  /** Controller cycle interval in milliseconds. */
  CYCLE_INTERVAL_MS: parseInt(process.env.INFRA_CYCLE_MS ?? "30000", 10), // 30 s
} as const;

export function shouldScaleUp(cpuLoad1m: number, memUsedPct: number): boolean {
  return (
    cpuLoad1m  > SCALING_POLICY.CPU_SCALE_UP_THRESHOLD ||
    memUsedPct > SCALING_POLICY.MEM_SCALE_UP_PCT
  );
}

export function shouldScaleDown(cpuLoad1m: number, memUsedPct: number): boolean {
  return (
    cpuLoad1m  < SCALING_POLICY.CPU_SCALE_DOWN_THRESHOLD &&
    memUsedPct < SCALING_POLICY.MEM_SCALE_DOWN_PCT
  );
}
