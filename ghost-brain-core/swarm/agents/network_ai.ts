/**
 * GhostBrain Swarm — Network AI
 *
 * Monitors network interface health and traffic patterns by:
 *   1. Reading recent network_degraded and network_error_spike events from
 *      persistent memory.
 *   2. Querying the supervisor API /metrics for live interface error rates.
 *   3. Identifying interfaces with sustained or worsening error rates and
 *      recommending rebalance or investigation actions.
 *   4. Publishing network:degraded and network:rebalance events on the bus.
 *
 * All recommendations are advisory; no network configuration changes are
 * made autonomously.
 */

import { request as httpRequest } from "http";
import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPERVISOR_URL = process.env["SUPERVISOR_API_URL"] ?? "http://localhost:9100";

/** Error rate considered elevated (matches NetworkController default). */
const ERROR_RATE_WARN = parseFloat(process.env["NET_ERROR_RATE_WARN"] ?? "0.001");

/** Number of recent network_degraded events that triggers a governance proposal. */
const DEGRADED_PROPOSAL_THRESHOLD = parseInt(process.env["NET_DEGRADED_PROPOSAL_THRESHOLD"] ?? "5", 10);

/** Lookback window for memory queries. Default: 1 hour. */
const HISTORY_WINDOW_MS = 60 * 60_000;

// ---------------------------------------------------------------------------
// Type for network metrics from supervisor /metrics endpoint
// ---------------------------------------------------------------------------

interface NetworkMetrics {
  network?: {
    interfaces: Array<{
      name:      string;
      errorRate: number;
      rxErrors:  number;
      txErrors:  number;
    }>;
  };
}

// ---------------------------------------------------------------------------
// NetworkAI
// ---------------------------------------------------------------------------

export class NetworkAI implements ISwarmAgent {
  readonly name = "network_ai";
  readonly role = "network" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];

    try {
      // 1 — Fetch live network metrics from supervisor (best-effort).
      const metrics = await this.fetchNetworkMetrics();

      // 2 — Flag live degraded interfaces.
      if (metrics?.network?.interfaces) {
        for (const iface of metrics.network.interfaces) {
          if (iface.errorRate >= ERROR_RATE_WARN) {
            ctx.bus.publish("network:degraded", this.name, {
              iface:     iface.name,
              errorRate: iface.errorRate,
              threshold: ERROR_RATE_WARN,
            });
            recommendations.push({
              kind:        "inspect_source",
              target:      iface.name,
              confidence:  Math.min(iface.errorRate / ERROR_RATE_WARN * 0.5, 0.85),
              priority:    60,
              description:
                `Network AI: interface "${iface.name}" error rate ` +
                `${(iface.errorRate * 100).toFixed(3)}% ≥ threshold ` +
                `${(ERROR_RATE_WARN * 100).toFixed(3)}%`,
            });
          }
        }
      }

      // 3 — Analyse memory for sustained network problems.
      const degradedEvents = ctx.memory.reader.query({
        categories: ["network_degraded", "network_error_spike"],
        since:      Date.now() - HISTORY_WINDOW_MS,
      });

      // Group by source (interface name is stored as source).
      const bySource = new Map<string, number>();
      for (const e of degradedEvents) {
        bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
      }

      for (const [iface, count] of bySource) {
        if (count >= DEGRADED_PROPOSAL_THRESHOLD) {
          ctx.bus.publish("network:rebalance", this.name, {
            fromNode: iface,
            toNode:   "auto",
            reason:   `${count} degraded events in the last hour`,
          });
          recommendations.push({
            kind:        "governance_propose",
            target:      iface,
            confidence:  Math.min(count / (DEGRADED_PROPOSAL_THRESHOLD * 2), 0.9),
            priority:    70,
            description:
              `Network AI: interface "${iface}" had ${count} degraded events in the ` +
              `last hour — sustained problem, recommend routing review`,
          });
        } else if (count >= 2) {
          recommendations.push({
            kind:        "monitor_increase",
            target:      iface,
            confidence:  count / DEGRADED_PROPOSAL_THRESHOLD,
            priority:    35,
            description:
              `Network AI: interface "${iface}" has ${count} degraded events in the ` +
              `last hour — watching closely`,
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
          `Live ifaces checked: ${metrics?.network?.interfaces?.length ?? 0}; ` +
          `history events: ${degradedEvents.length}; ` +
          `degraded sources: ${bySource.size}`,
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
  // Private
  // ---------------------------------------------------------------------------

  private fetchNetworkMetrics(): Promise<NetworkMetrics | null> {
    return new Promise(resolve => {
      const url     = new URL("/metrics", SUPERVISOR_URL);
      const timeout = setTimeout(() => resolve(null), 3_000);
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: "GET" },
        res => {
          clearTimeout(timeout);
          let body = "";
          res.setEncoding("utf8");
          res.on("data", c => { body += c; });
          res.on("end", () => {
            try { resolve(JSON.parse(body) as NetworkMetrics); }
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
