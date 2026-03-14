/**
 * Network Manager
 *
 * Evaluates endpoint latency from SystemState.network and proposes
 * reroute actions when average latency exceeds MAX_LATENCY_MS.
 *
 * Actual rerouting (iptables / Kong gateway config changes) always
 * requires human ratification — network changes affect all services.
 */
import type { SystemState, InfraAction } from "../types.js";
import { MAX_LATENCY_MS } from "../policies/security-policy.js";

export async function manageNetwork(state: SystemState): Promise<InfraAction[]> {
  const actions: InfraAction[] = [];
  const now = Date.now();

  const { network } = state;

  // High-latency alert
  if (
    network.avgLatency !== null &&
    network.avgLatency > MAX_LATENCY_MS
  ) {
    actions.push({
      id:          crypto.randomUUID(),
      type:        "network_reroute",
      target:      "infrastructure",
      description: `Average endpoint latency ${network.avgLatency.toFixed(0)}ms exceeds threshold ${MAX_LATENCY_MS}ms. Propose reviewing Kong load balancer routing and upstream connectivity.`,
      params: {
        avgLatencyMs: network.avgLatency,
        thresholdMs:  MAX_LATENCY_MS,
        endpoints:    network.endpoints.map(e => ({
          endpoint: `${e.host}:${e.port}`,
          latencyMs: e.latency,
        })),
      },
      timestamp:   now,
      risk:        "medium",
      autoExecute: false,
    });
  }

  // Unreachable endpoints alert
  if (network.unreachable.length > 0) {
    const isCritical = network.unreachable.length >= 2;
    actions.push({
      id:          crypto.randomUUID(),
      type:        "network_reroute",
      target:      network.unreachable.join(", "),
      description: `${network.unreachable.length} endpoint(s) unreachable: ${network.unreachable.join(", ")}. ${isCritical ? "CRITICAL: multiple endpoints down." : "Check service health."}`,
      params: {
        unreachable:  network.unreachable,
        reachable:    network.endpoints.filter(e => e.latency !== null).map(e => `${e.host}:${e.port}`),
        totalEndpoints: network.endpoints.length,
      },
      timestamp:   now,
      risk:        isCritical ? "critical" : "high",
      autoExecute: false,
    });
  }

  return actions;
}
