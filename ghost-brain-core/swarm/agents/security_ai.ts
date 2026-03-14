/**
 * GhostBrain Swarm — Security AI
 *
 * Monitors the GhostStack threat surface by:
 *   1. Querying GhostBrain /v1/classify for a system-level risk score.
 *   2. Scanning the memory index for recent risk_alert and anomaly_detected
 *      events and computing a composite threat score.
 *   3. Publishing security:risk_alert on the bus when score breaches threshold.
 *   4. Recommending governance proposals for sustained high-risk conditions.
 *
 * Never executes commands or modifies configuration. All actions are advisory,
 * forwarded to humans via the signing relay through the governance layer.
 */

import { request as httpRequest } from "http";
import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GHOSTBRAIN_API_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

/** Risk score threshold above which a security alert is raised. */
const RISK_ALERT_THRESHOLD = parseFloat(process.env["SEC_RISK_THRESHOLD"] ?? "0.65");

/** Sustained risk alert threshold — if risk stays high for N ticks, propose governance action. */
const SUSTAINED_THRESHOLD = parseInt(process.env["SEC_SUSTAINED_TICKS"] ?? "3", 10);

/** Short lookback used for recent event counting (15 minutes). */
const RECENT_WINDOW_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Module state: track consecutive high-risk ticks.
// ---------------------------------------------------------------------------

let consecutiveHighRiskTicks = 0;

// ---------------------------------------------------------------------------
// SecurityAI
// ---------------------------------------------------------------------------

export class SecurityAI implements ISwarmAgent {
  readonly name = "security_ai";
  readonly role = "security" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];

    try {
      // 1 — Count recent risk and anomaly events from memory.
      const recentRiskAlerts  = ctx.memory.reader.recent("risk_alert",         20);
      const recentAnomalies   = ctx.memory.reader.recent("anomaly_detected",   20);
      const windowedRisk      = ctx.memory.reader.query({ categories: ["risk_alert"], since: Date.now() - RECENT_WINDOW_MS });
      const windowedAnomalies = ctx.memory.reader.query({ categories: ["anomaly_detected"], since: Date.now() - RECENT_WINDOW_MS });

      // 2 — Query GhostBrain for a live risk classification.
      const liveRisk = await this.fetchRiskScore({
        recentRiskCount:    windowedRisk.length,
        recentAnomalyCount: windowedAnomalies.length,
      });

      // 3 — Compute composite threat score.
      const memoryScore = Math.min(
        (windowedRisk.length * 0.05) + (windowedAnomalies.length * 0.02),
        0.5,
      );
      const compositeScore = Math.min((liveRisk ?? 0) * 0.7 + memoryScore * 0.3, 1.0);

      // 4 — Track sustained high-risk state.
      if (compositeScore >= RISK_ALERT_THRESHOLD) {
        consecutiveHighRiskTicks++;
        ctx.bus.publish("security:risk_alert", this.name, {
          source:    "security_ai",
          riskScore: compositeScore,
          threshold: RISK_ALERT_THRESHOLD,
          details: {
            liveRisk,
            windowedRiskCount:    windowedRisk.length,
            windowedAnomalyCount: windowedAnomalies.length,
          },
        });
        recommendations.push({
          kind:        "security_alert",
          confidence:  compositeScore,
          priority:    85,
          description:
            `Security AI: composite threat score ${compositeScore.toFixed(3)} ≥ ` +
            `threshold ${RISK_ALERT_THRESHOLD} (tick ${consecutiveHighRiskTicks})`,
        });
      } else {
        consecutiveHighRiskTicks = 0;
      }

      // 5 — Governance proposal if risk has been sustained.
      if (consecutiveHighRiskTicks >= SUSTAINED_THRESHOLD) {
        recommendations.push({
          kind:        "governance_propose",
          confidence:  Math.min(compositeScore * 1.1, 1.0),
          priority:    95,
          description:
            `Security AI: elevated risk for ${consecutiveHighRiskTicks} consecutive ticks — ` +
            `propose human security review via governance`,
        });
        // Reset to avoid flooding proposals.
        consecutiveHighRiskTicks = 0;
      }

      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         true,
        durationMs:      Date.now() - t0,
        recommendations,
        summary:
          `composite=${compositeScore.toFixed(3)} ` +
          `liveRisk=${liveRisk?.toFixed(3) ?? "n/a"} ` +
          `sustainedTicks=${consecutiveHighRiskTicks}`,
      };
    } catch (err) {
      consecutiveHighRiskTicks = 0;
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
  // Private: call GhostBrain /v1/classify with security context
  // ---------------------------------------------------------------------------

  private fetchRiskScore(context: Record<string, unknown>): Promise<number | null> {
    return new Promise(resolve => {
      const body   = JSON.stringify({ type: "security_audit", context });
      const url    = new URL("/v1/classify", GHOSTBRAIN_API_URL);
      const timeout = setTimeout(() => resolve(null), 3_000);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port:     url.port,
          path:     url.pathname,
          method:   "POST",
          headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        },
        res => {
          clearTimeout(timeout);
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", c => { raw += c; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(raw) as { risk_score?: number };
              resolve(typeof parsed.risk_score === "number" ? parsed.risk_score : null);
            } catch { resolve(null); }
          });
        },
      );
      req.on("error", () => { clearTimeout(timeout); resolve(null); });
      req.setTimeout(3_000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }
}
