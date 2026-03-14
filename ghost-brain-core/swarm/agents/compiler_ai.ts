/**
 * GhostBrain Swarm — Compiler AI
 *
 * Monitors the GhostTensor compiler daemon (port 7930) and the AI runtime
 * management API (port 7901) to assess compile pipeline health. Reports
 * latency, availability, and whether the compile queue appears backlogged.
 *
 * This agent is advisory — it does not trigger recompiles autonomously.
 * Any recompile recommendation flows through ConsensusEngine and requires
 * human ratification or an InfrastructureAI-initiated container restart.
 */

import { request as httpRequest } from "http";
import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COMPILER_API_URL = process.env["GHOSTBRAIN_COMPILER_URL"] ?? "http://localhost:7930";
const RUNTIME_MGMT_URL = process.env["GHOSTBRAIN_MGMT_URL"]     ?? "http://localhost:7901";

/** Latency above this threshold is flagged as degraded. Default: 2 000 ms. */
const LATENCY_WARN_MS = parseInt(process.env["COMPILER_LATENCY_WARN_MS"] ?? "2000", 10);

/** Consecutive unhealthy ticks before a restart is recommended. */
const UNHEALTHY_TICKS_THRESHOLD = parseInt(process.env["COMPILER_UNHEALTHY_TICKS"] ?? "3", 10);

// Module state.
let consecutiveUnhealthyTicks = 0;

// ---------------------------------------------------------------------------
// CompilerAI
// ---------------------------------------------------------------------------

export class CompilerAI implements ISwarmAgent {
  readonly name = "compiler_ai";
  readonly role = "compiler" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];

    try {
      // Probe compiler daemon health endpoint.
      const [compilerHealth, runtimeHealth] = await Promise.allSettled([
        this.probe(COMPILER_API_URL,  "/health"),
        this.probe(RUNTIME_MGMT_URL,  "/health"),
      ]);

      const compilerOk  = compilerHealth.status  === "fulfilled" && compilerHealth.value.ok;
      const runtimeOk   = runtimeHealth.status   === "fulfilled" && runtimeHealth.value.ok;
      const compilerMs  = compilerHealth.status  === "fulfilled" ? compilerHealth.value.latencyMs : -1;
      const runtimeMs   = runtimeHealth.status   === "fulfilled" ? runtimeHealth.value.latencyMs  : -1;

      // Publish health status on bus.
      ctx.bus.publish("compiler:health", this.name, {
        healthy:    compilerOk && runtimeOk,
        httpStatus: compilerHealth.status === "fulfilled" ? compilerHealth.value.statusCode : undefined,
        latencyMs:  compilerMs,
        error:      compilerHealth.status === "rejected" ? String(compilerHealth.reason) : undefined,
      });

      // Track consecutive unhealthy ticks.
      if (!compilerOk) {
        consecutiveUnhealthyTicks++;
        if (consecutiveUnhealthyTicks >= UNHEALTHY_TICKS_THRESHOLD) {
          recommendations.push({
            kind:        "restart_container",
            target:      "ghostbrain-compiler",
            confidence:  Math.min(0.5 + consecutiveUnhealthyTicks * 0.1, 0.9),
            priority:    75,
            description:
              `Compiler AI: compiler daemon unreachable for ${consecutiveUnhealthyTicks} ticks — ` +
              `recommend container restart`,
          });
        }
      } else {
        consecutiveUnhealthyTicks = 0;
      }

      // Flag high latency.
      if (compilerOk && compilerMs > LATENCY_WARN_MS) {
        recommendations.push({
          kind:        "inspect_source",
          target:      "ghostbrain-compiler",
          confidence:  Math.min((compilerMs - LATENCY_WARN_MS) / LATENCY_WARN_MS * 0.5, 0.7),
          priority:    40,
          description:
            `Compiler AI: compiler latency ${compilerMs}ms > warn threshold ${LATENCY_WARN_MS}ms`,
        });
      }

      // Check memory for recent repair_failed events affecting compiler.
      const compilerErrors = ctx.memory.reader.query({
        categories: ["repair_failed"],
        source:     "ghostbrain-compiler",
        since:      Date.now() - 30 * 60_000,
      });
      if (compilerErrors.length >= 2) {
        recommendations.push({
          kind:        "governance_propose",
          target:      "ghostbrain-compiler",
          confidence:  Math.min(compilerErrors.length * 0.15, 0.8),
          priority:    50,
          description:
            `Compiler AI: ${compilerErrors.length} compiler failures in last 30min — ` +
            `propose kernel reload via governance`,
        });
      }

      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         true,
        durationMs:      Date.now() - t0,
        recommendations,
        summary:
          `compiler=${compilerOk ? "ok" : "down"} (${compilerMs}ms) ` +
          `runtime=${runtimeOk ? "ok" : "down"} (${runtimeMs}ms)`,
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
  // Private: HTTP health probe
  // ---------------------------------------------------------------------------

  private probe(
    baseUrl:  string,
    path:     string,
  ): Promise<{ ok: boolean; statusCode: number; latencyMs: number }> {
    return new Promise((resolve, reject) => {
      const t0      = Date.now();
      const url     = new URL(path, baseUrl);
      const timeout = setTimeout(() => reject(new Error("timeout")), 3_000);
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: "GET" },
        res => {
          clearTimeout(timeout);
          res.resume(); // drain body
          res.on("end", () => {
            resolve({
              ok:         (res.statusCode ?? 500) < 400,
              statusCode: res.statusCode ?? 0,
              latencyMs:  Date.now() - t0,
            });
          });
        },
      );
      req.on("error", err => { clearTimeout(timeout); reject(err); });
      req.setTimeout(3_000, () => { req.destroy(); reject(new Error("timeout")); });
      req.end();
    });
  }
}
