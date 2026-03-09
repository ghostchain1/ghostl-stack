/**
 * GhostDAO AI
 *
 * Aggregates proposals from GhostArchitect, GhostGovernor, etc.
 * Synthesises vote analysis, derives quorum status, and recommends
 * governance actions. All on-chain execution requires human ratification.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask, BusEvent } from "../types.js";

const GOVERNOR_AI_URL = process.env.GOVERNOR_AI_URL  ?? "http://127.0.0.1:7930";
const GHOSTBRAIN_URL  = process.env.GHOSTBRAIN_URL    ?? "http://127.0.0.1:7900";

// GhostChain governance constants
const QUORUM_BPS         = 4_000;   // 40%
const MIN_VOTE_PERIOD_S  = 172_800; // 48 hours

export class GhostDaoAgent extends BaseAgent {
  readonly role         = "dao" as const;
  readonly name         = "GhostDAO AI";
  readonly description  = "Aggregates governance proposals, analyzes votes, and automates DAO reporting";
  readonly capabilities = [
    "propose-upgrade", "analyze-vote",
    "enforce-constitution", "dao-report",
  ];

  constructor() {
    super();
    // Listen for cross-agent governance alerts
    bus.subscribe<Record<string, unknown>>("alert:governance", (event: BusEvent<Record<string, unknown>>) => {
      void this.handleGovernanceAlert(event);
    });
  }

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "propose-upgrade":       return this.proposeUpgrade(task.payload);
      case "analyze-vote":          return this.analyzeVote(task.payload);
      case "enforce-constitution":  return this.enforceConstitution(task.payload);
      default:                      return this.daoReport();
    }
  }

  private async daoReport(): Promise<Record<string, unknown>> {
    const govAlerts = bus.getByType("alert:governance", 10);
    const report: Record<string, unknown> = {
      recentGovernanceAlerts: govAlerts.length,
      alerts: govAlerts.map(e => ({ ts: e.timestamp, source: e.source, data: e.payload })),
      constants: { quorumBps: QUORUM_BPS, minVotePeriodS: MIN_VOTE_PERIOD_S },
    };

    // Try to fetch live proposals from governor-ai
    const proposals = await this.fetchProposals();
    if (proposals) report["activeProposals"] = proposals;

    return report;
  }

  private async proposeUpgrade(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const title       = String(payload["title"]       ?? "Untitled Upgrade");
    const description = String(payload["description"] ?? "");
    const targets     = payload["targets"] as string[]  ?? [];
    const values      = payload["values"]  as number[]  ?? [];
    const calldatas   = payload["calldatas"] as string[] ?? [];

    if (!description || targets.length === 0) {
      return { error: "description and targets[] are required" };
    }

    // Relay to governor-ai for execution
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${GOVERNOR_AI_URL}/api/v1/proposals`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ title, description, targets, values, calldatas }),
        signal:  ctrl.signal,
      });
      if (res.ok) {
        const result = await res.json() as Record<string, unknown>;
        bus.publish("alert:governance", "dao", { type: "proposal-submitted", title, result });
        return { title, status: "submitted", result, humanApprovalRequired: true };
      }
    } catch { /* governor-ai offline */ }

    // Offline: draft only, do not submit
    const draft = { title, description, targets, values, calldatas, draftedAt: new Date().toISOString() };
    bus.publish("workflow:step", "dao", { step: "proposal-drafted-offline", title });
    return { title, status: "draft-only", draft, humanApprovalRequired: true, note: "Governor AI offline — proposal stored as draft" };
  }

  private async analyzeVote(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const proposalId    = String(payload["proposalId"] ?? "");
    const forVotes      = Number(payload["forVotes"]   ?? 0);
    const againstVotes  = Number(payload["againstVotes"] ?? 0);
    const abstainVotes  = Number(payload["abstainVotes"] ?? 0);
    const totalSupply   = Number(payload["totalSupply"] ?? 1);

    const totalVotes    = forVotes + againstVotes + abstainVotes;
    const participationBps = Math.round(totalVotes / totalSupply * 10_000);
    const forBps           = totalVotes > 0 ? Math.round(forVotes / totalVotes * 10_000) : 0;
    const quorumReached    = participationBps >= QUORUM_BPS;
    const passing          = quorumReached && forBps > 5_000;

    const analysis = {
      proposalId,
      forVotes, againstVotes, abstainVotes, totalVotes,
      participationBps, forBps,
      quorumRequired: QUORUM_BPS,
      quorumReached,
      passing,
      recommendation: passing
        ? "PASS — quorum met and majority in favour"
        : quorumReached
          ? "FAIL — quorum met but majority against"
          : "PENDING — quorum not reached",
    };

    bus.publish("workflow:step", "dao", { step: "vote-analyzed", ...analysis });
    return analysis;
  }

  private async enforceConstitution(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const proposalText = String(payload["proposalText"] ?? "");
    if (!proposalText) return { error: "proposalText required" };

    const CONSTITUTIONAL_RULES = [
      { pattern: /eth_|mainnet|ethereum\s+mainnet/i,        rule: "No Ethereum mainnet dependency",              severity: "critical" },
      { pattern: /execute|deploy\s+without.*gov/i,           rule: "No autonomous execution without governance",  severity: "critical" },
      { pattern: /drain.*treasury|empty.*treasury/i,         rule: "No treasury drain without DAO supermajority", severity: "critical" },
      { pattern: /chainlink/i,                               rule: "Route oracle through GhostBrain, not Chainlink direct", severity: "high" },
      { pattern: /uniswap|sushiswap/i,                       rule: "Use GhostXchange, not external DEXes",        severity: "high" },
    ];

    const violations = CONSTITUTIONAL_RULES
      .filter(r => r.pattern.test(proposalText))
      .map(r => ({ rule: r.rule, severity: r.severity }));

    const compliant = violations.length === 0;

    if (!compliant) {
      bus.publish("alert:governance", "dao", { type: "constitution-violation", violations });
    }

    return { compliant, violations, note: compliant ? "Proposal passes constitutional review" : "Proposal BLOCKED — constitutional violations detected" };
  }

  private async fetchProposals(): Promise<unknown[] | null> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch(`${GOVERNOR_AI_URL}/api/v1/proposals`, { signal: ctrl.signal });
      if (res.ok) return await res.json() as unknown[];
    } catch { /* offline */ }
    return null;
  }

  private async handleGovernanceAlert(event: BusEvent<Record<string, unknown>>): Promise<void> {
    const data = event.payload;
    if (data["urgent"]) {
      // Fast-track urgent alerts through GhostBrain signals
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5_000);
        await fetch(`${GHOSTBRAIN_URL}/api/v1/signals`, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({ event: "dao:urgent-alert", source: event.source, data }),
          signal:  ctrl.signal,
        });
      } catch { /* ghostbrain offline */ }
    }
  }
}
