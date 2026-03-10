/**
 * GhostDeployAI Agent
 *
 * Autonomous deployment intelligence layer.  Monitors companion services for
 * degraded health states, then drafts redeploy proposals for human ratification
 * via the signing relay at http://localhost:7910.
 *
 * Governance rule (AGENTS.md §7):
 *   AI may DRAFT proposals; humans must RATIFY them via governance quorum.
 *   No autonomous service replacement or on-chain deployment without approval.
 */

import { request }     from "undici";
import { store_event } from "../memory_engine.js";
import { log }         from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNING_RELAY   = process.env.SIGNING_RELAY_URL            ?? "http://localhost:7910";
const DEPLOY_INTERVAL = Number(process.env.GHOST_DEPLOY_INTERVAL_MS ?? "120000"); // 2 min

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostDeployAIConfig {
  intervalMs?: number;
  dryRun?:     boolean;
}

interface DeployProposal {
  service:   string;
  action:    "redeploy" | "upgrade" | "rollback";
  reason:    string;
  draftedAt: number;
  draftedBy: string;
  status:    "pending_ratification";
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class GhostDeployAI {
  readonly name = "GhostDeployAI";

  private readonly dry: boolean;
  private interval: ReturnType<typeof setInterval> | null = null;
  private cycles     = 0;
  private drafted    = 0;

  constructor(cfg: GhostDeployAIConfig = {}) {
    this.dry = cfg.dryRun ?? (process.env.GHOST_DEPLOY_DRY_RUN === "1");
    const ms  = cfg.intervalMs ?? DEPLOY_INTERVAL;
    log.info("ghost_deploy_ai: init", `intervalMs=${ms} dry=${this.dry}`);
    this.interval = setInterval(() => void this.tick(), ms);
  }

  // ── Polling loop ────────────────────────────────────────────────────────────

  async tick(): Promise<void> {
    this.cycles++;
    log.debug("ghost_deploy_ai: tick", `cycle=${this.cycles}`);

    const candidates = await this.detectDegradedServices();
    for (const svc of candidates) {
      await this.proposeRedeploy(svc);
    }
  }

  // ── Service health probing ──────────────────────────────────────────────────

  private readonly _probeEndpoints: Array<{ service: string; url: string }> = [
    { service: "l3-fee-collector",      url: "http://localhost:7681/healthz" },
    { service: "l2-revenue-aggregator", url: "http://localhost:7682/healthz" },
    { service: "treasury-engine",       url: "http://localhost:7683/healthz" },
    { service: "reward-distributor",    url: "http://localhost:7684/healthz" },
  ];

  private async detectDegradedServices(): Promise<Array<{ service: string; reason: string }>> {
    const degraded: Array<{ service: string; reason: string }> = [];

    for (const ep of this._probeEndpoints) {
      try {
        const res = await request(ep.url, { method: "GET", bodyTimeout: 3_000 });
        if (res.statusCode >= 500) {
          degraded.push({
            service: ep.service,
            reason:  `health endpoint returned HTTP ${res.statusCode}`,
          });
        }
      } catch {
        // Service may be optional or not yet started — skip silently
      }
    }

    return degraded;
  }

  // ── Proposal drafting ───────────────────────────────────────────────────────

  private async proposeRedeploy(svc: { service: string; reason: string }): Promise<void> {
    const proposal: DeployProposal = {
      service:   svc.service,
      action:    "redeploy",
      reason:    svc.reason,
      draftedAt: Date.now(),
      draftedBy: this.name,
      status:    "pending_ratification",
    };

    store_event({
      category:   "devops",
      label:      "deploy_proposal_drafted",
      resourceId: svc.service,
      layer:      "devops",
      severity:   "warning",
      payload:    proposal as unknown as Record<string, unknown>,
    });

    if (!this.dry) {
      try {
        const res = await request(SIGNING_RELAY + "/proposals", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify(proposal),
          bodyTimeout: 6_000,
        });
        if (res.statusCode < 300) {
          this.drafted++;
          log.info("ghost_deploy_ai: proposal_forwarded", `service=${svc.service}`);
        } else {
          log.warn("ghost_deploy_ai: relay_status", `service=${svc.service} status=${res.statusCode}`);
        }
      } catch (err) {
        log.warn("ghost_deploy_ai: relay_unreachable", String(err));
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    log.info("ghost_deploy_ai: stopped", "deployment monitor halted");
  }

  stats(): Record<string, unknown> {
    return { cycles: this.cycles, drafted: this.drafted, dry: this.dry };
  }
}
