/**
 * GhostBrain Swarm — Infrastructure AI
 *
 * Monitors hypervisor, VM, and Docker health by querying the GhostBrain
 * supervisor API (port 9100) for the current metrics snapshot. Produces
 * recommendations for container/VM repairs and publishes node alerts on
 * the bus.
 *
 * This agent is complementary to the supervisor's own DecisionEngine:
 *   - The supervisor acts on immediate failures within its tick.
 *   - InfrastructureAI uses historical memory to detect slowly degrading
 *     nodes that look "OK right now" but have a bad recent record.
 *
 * No shell calls. All data comes from the supervisor REST API or memory.
 */

import { request as httpRequest } from "http";
import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPERVISOR_URL = process.env["SUPERVISOR_API_URL"] ?? "http://localhost:9100";

/** Lookback window for failure history scoring. Default: 30 minutes. */
const HISTORY_WINDOW_MS = parseInt(process.env["INFRA_HISTORY_WINDOW_MS"] ?? "1800000", 10);

/** A node with ≥ this many failures in the window is flagged. */
const FAILURE_THRESHOLD = parseInt(process.env["INFRA_FAILURE_THRESHOLD"] ?? "3", 10);

// ---------------------------------------------------------------------------
// Types from supervisor /metrics response
// ---------------------------------------------------------------------------

interface SupervisorMetrics {
  vmScan?:    { vms: Array<{ name: string; state: string }> };
  containers?: Array<{ name: string; status: string; health: string }>;
  hypervisor?: { loadPct: number; memUsedPct: number };
  l2BlockLag?: number;
}

// ---------------------------------------------------------------------------
// InfrastructureAI
// ---------------------------------------------------------------------------

export class InfrastructureAI implements ISwarmAgent {
  readonly name = "infrastructure_ai";
  readonly role = "infrastructure" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];

    try {
      // Fetch live metrics from supervisor API (best-effort, 3s timeout).
      const metrics = await this.fetchMetrics();

      // 1 — Check VMs reported as offline.
      if (metrics?.vmScan) {
        for (const vm of metrics.vmScan.vms) {
          if (vm.state === "offline" || vm.state === "crashed") {
            ctx.bus.publish("infra:node_alert", this.name, {
              nodeName:  vm.name,
              alertKind: "vm_offline",
              reason:    `VM state: ${vm.state}`,
            });
            recommendations.push({
              kind:        "restart_vm",
              target:      vm.name,
              confidence:  0.85,
              priority:    90,
              description: `Infrastructure AI: VM "${vm.name}" is ${vm.state}`,
            });
          }
        }
      }

      // 2 — Check unhealthy containers.
      if (metrics?.containers) {
        for (const c of metrics.containers) {
          const isUnhealthy = c.health === "unhealthy";
          const isExited    = c.status.startsWith("Exited");
          if (isUnhealthy || isExited) {
            ctx.bus.publish("infra:node_alert", this.name, {
              nodeName:  c.name,
              alertKind: isExited ? "container_exited" : "container_unhealthy",
              reason:    `health=${c.health} status=${c.status}`,
            });
            recommendations.push({
              kind:        isExited ? "rebuild_container" : "restart_container",
              target:      c.name,
              confidence:  0.8,
              priority:    80,
              description: `Infrastructure AI: container "${c.name}" is ${isExited ? "exited" : "unhealthy"}`,
            });
          }
        }
      }

      // 3 — History-aware node scoring: flag nodes with many recent failures.
      const sourceFreq = ctx.memory.reader.sourceFrequencyMap(HISTORY_WINDOW_MS);
      for (const { source, count } of sourceFreq) {
        if (count >= FAILURE_THRESHOLD) {
          recommendations.push({
            kind:        "inspect_source",
            target:      source,
            confidence:  Math.min(0.5 + (count - FAILURE_THRESHOLD) * 0.05, 0.9),
            priority:    55,
            description:
              `Infrastructure AI: "${source}" has ${count} failures in the last ` +
              `${HISTORY_WINDOW_MS / 60_000}min — historically unstable node`,
          });
        }
      }

      // 4 — Hypervisor overload.
      if (metrics?.hypervisor) {
        const h = metrics.hypervisor;
        if (h.loadPct >= 90 || h.memUsedPct >= 90) {
          ctx.bus.publish("infra:node_alert", this.name, {
            nodeName:  "hypervisor",
            alertKind: "hypervisor_overload",
            cpuPct:    h.loadPct,
            memPct:    h.memUsedPct,
          });
          recommendations.push({
            kind:        "scale_up",
            confidence:  0.75,
            priority:    70,
            description:
              `Infrastructure AI: hypervisor load=${h.loadPct.toFixed(1)}% ` +
              `mem=${h.memUsedPct.toFixed(1)}% — consider scaling`,
          });
        }
      }

      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         true,
        durationMs:      Date.now() - t0,
        recommendations,
        summary:
          `Live metrics: ${metrics ? "ok" : "unavailable"}; ` +
          `recommendations: ${recommendations.length}`,
      };
    } catch (err) {
      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         false,
        durationMs:      Date.now() - t0,
        recommendations: [],
        summary:         err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private: fetch supervisor /metrics via http module (no third-party libs)
  // ---------------------------------------------------------------------------

  private fetchMetrics(): Promise<SupervisorMetrics | null> {
    return new Promise(resolve => {
      const url     = new URL("/metrics", SUPERVISOR_URL);
      const timeout = setTimeout(() => resolve(null), 3_000);
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: "GET" },
        res => {
          clearTimeout(timeout);
          let body = "";
          res.setEncoding("utf8");
          res.on("data", chunk => { body += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(body) as SupervisorMetrics); }
            catch { resolve(null); }
          });
        },
      );
      req.on("error", () => { clearTimeout(timeout); resolve(null); });
      req.setTimeout(3_000, () => { req.destroy(); resolve(null); });
      req.end();
    });
  }
}
