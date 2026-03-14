/**
 * GAAN — Agent Registry
 * Central store for all registered AI agents. Holds status, capabilities,
 * decision history and runtime metrics for each agent in the network.
 */

import { v4 as uuid } from "uuid";
import logger from "../utils/logger";

export type AgentStatus  = "idle" | "running" | "error" | "paused" | "booting";
export type AgentDomain  = "infrastructure" | "security" | "marketing" | "growth"
                         | "governance"     | "economy"  | "interchain"
                         | "architect"      | "auditor"  | "defender"
                         | "strategist"     | "operator";
export type ImpactLevel  = "low" | "medium" | "high" | "critical";

export interface AgentDecision {
  id:        string;
  agentId:   string;
  action:    string;       // short action label
  reasoning: string;       // why the agent took this decision
  impact:    ImpactLevel;
  outcome:   string;       // what happened as a result
  timestamp: number;
}

export interface RegisteredAgent {
  id:               string;      // e.g. "infrastructure-agent"
  name:             string;
  domain:           AgentDomain;
  icon:             string;      // emoji
  status:           AgentStatus;
  version:          string;
  registeredAt:     number;
  lastHeartbeat:    number;
  lastRun:          number;
  tasksCompleted:   number;
  tasksActive:      number;
  tasksFailed:      number;
  currentTask?:     string;
  capabilities:     string[];
  linkedEngineName: string;      // human readable engine name
  linkedEnginePort: number;
  decisions:        AgentDecision[];  // rolling max 50
  cycleCount:       number;
  autonomyLevel:    number;           // 0-100
}

// ── In-memory store ───────────────────────────────────────────────────────────

const agents = new Map<string, RegisteredAgent>();
const MAX_DECISIONS = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

const hoursAgo = (h: number): number => Date.now() - h * 3_600_000;
const minsAgo  = (m: number): number => Date.now() - m * 60_000;

function mkDecision(agentId: string, action: string, reasoning: string, impact: ImpactLevel, outcome: string, tsOverride?: number): AgentDecision {
  return {
    id:        uuid(),
    agentId,
    action,
    reasoning,
    impact,
    outcome,
    timestamp: tsOverride ?? Date.now(),
  };
}

// ── Seed ──────────────────────────────────────────────────────────────────────

export function seedAgents(): void {
  const SEED: RegisteredAgent[] = [
    {
      id: "infrastructure-agent", name: "Infrastructure Agent", domain: "infrastructure",
      icon: "🏗️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 184, tasksActive: 1, tasksFailed: 4, cycleCount: 92,
      autonomyLevel: 91,
      capabilities: ["node-scaling", "resource-optimization", "health-monitoring", "auto-repair", "load-balancing"],
      linkedEngineName: "Autonomous Infrastructure Engine (AIE)", linkedEnginePort: 9975,
      decisions: [
        mkDecision("infrastructure-agent", "Scale validator nodes",   "Network load reached 84% (threshold 80%)", "high",   "Scaled from 12 → 14 validator nodes; load down to 61%", hoursAgo(1)),
        mkDecision("infrastructure-agent", "Auto-repair node n3",     "Disk usage 97%, causing slow block production",       "medium", "Cleaned logs, freed 18 GB; node restored to healthy",   hoursAgo(3)),
        mkDecision("infrastructure-agent", "Rebalance RPC cluster",   "RPC latency p95 = 380 ms (threshold 200 ms)",         "medium", "Shifted 4 CPU cores to RPC pool; p95 now 140 ms",       hoursAgo(6)),
        mkDecision("infrastructure-agent", "Increase memory ceiling", "GhostL2 sequencer OOM risk detected",                "high",   "Raised memory limit by 2 GB; OOM risk cleared",         hoursAgo(11)),
        mkDecision("infrastructure-agent", "Scheduled node restart",  "Node n7 uptime > 30 days; rolling restart triggered", "low",    "Node restarted cleanly in 8 s; no block gaps",          hoursAgo(18)),
      ],
    },
    {
      id: "security-agent", name: "Security Agent", domain: "security",
      icon: "🛡️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 247, tasksActive: 2, tasksFailed: 2, cycleCount: 92,
      autonomyLevel: 95,
      capabilities: ["threat-detection", "intrusion-prevention", "ddos-mitigation", "key-rotation", "anomaly-scanning"],
      linkedEngineName: "Autonomous Security Engine (ASE)", linkedEnginePort: 9976,
      decisions: [
        mkDecision("security-agent", "Block suspicious wallets",   "7 wallets exhibiting wash-trading + bot pattern",   "high",     "Wallets flagged, transactions rejected at mempool",      minsAgo(15)),
        mkDecision("security-agent", "Elevate DDoS protection",    "API gateway traffic spike 340% above baseline",     "critical", "Activated rate-limiting; bad IPs blocked (2,340 IPs)",   hoursAgo(2)),
        mkDecision("security-agent", "Rotate node signing keys",   "Scheduled 90-day key rotation",                    "medium",   "Keys rotated on n1, n2, n3; validators re-attested",     hoursAgo(8)),
        mkDecision("security-agent", "Quarantine compromised RPC",  "Unexpected admin call from unknown IP",             "critical", "RPC node isolated; forensics log captured",              hoursAgo(14)),
        mkDecision("security-agent", "Patch validator firmware",    "CVE-2026-0142 advisory issued",                     "high",     "Firmware patched across 14 validators (zero downtime)",  hoursAgo(20)),
      ],
    },
    {
      id: "marketing-agent", name: "Marketing Agent", domain: "marketing",
      icon: "📣", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 128, tasksActive: 1, tasksFailed: 3, cycleCount: 92,
      autonomyLevel: 83,
      capabilities: ["campaign-generation", "seo-optimization", "content-creation", "social-scheduling", "influencer-outreach"],
      linkedEngineName: "AI Marketing Engine (AIMS)", linkedEnginePort: 9970,
      decisions: [
        mkDecision("marketing-agent", "Launch L2 awareness campaign",  "GhostL2 launch milestone → opportunity window",        "high",   "Campaign live on Twitter/LinkedIn/Reddit; 84K impressions d1", minsAgo(30)),
        mkDecision("marketing-agent", "Publish dev tutorial series",   "Developer funnel CTR below 2%; content gap detected",  "medium", "3 tutorials queued; estimated +180 devs/mo",                 hoursAgo(5)),
        mkDecision("marketing-agent", "SEO optimization push",         "Organic search traffic fell 12% WoW",                  "medium", "34 on-page fixes applied; expected +18% traffic in 4 weeks", hoursAgo(10)),
        mkDecision("marketing-agent", "Activate influencer tier-2",    "Tier-1 CPC too high ($4.20); tier-2 ROI 3.1×",         "low",    "12 tier-2 influencers activated; 280K combined reach",        hoursAgo(16)),
        mkDecision("marketing-agent", "Schedule 14-day social plan",   "Content calendar gap detected",                        "low",    "42 posts scheduled across 3 platforms",                      hoursAgo(22)),
      ],
    },
    {
      id: "growth-agent", name: "Growth Agent", domain: "growth",
      icon: "📈", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 97, tasksActive: 2, tasksFailed: 5, cycleCount: 92,
      autonomyLevel: 80,
      capabilities: ["developer-recruitment", "dapp-onboarding", "grant-distribution", "viral-campaigns", "ecosystem-metrics"],
      linkedEngineName: "Viral Growth Engine (VGE)", linkedEnginePort: 9971,
      decisions: [
        mkDecision("growth-agent", "Approve developer grants",    "3 applications scored > 85/100 by AI review",   "high",   "Grants approved: $15K + $18K + $12K = $45K total",       minsAgo(45)),
        mkDecision("growth-agent", "Onboard 2 new dApps",         "GhostL2 EVM compatibility confirmed → devs ready","medium", "GhostSwap v2 + GhostLend onboarded; TVL +$820K estimated", hoursAgo(7)),
        mkDecision("growth-agent", "GitHub outreach campaign",    "Target: Solidity devs with 500+ stars repos",    "medium", "47 leads engaged; 9 positive responses",                  hoursAgo(12)),
        mkDecision("growth-agent", "Launch referral program",     "User acquisition cost 3× organic; referral cheaper","high","Referral program live; 340 codes issued in 24h",          hoursAgo(18)),
        mkDecision("growth-agent", "Ecosystem report published",  "Monthly transparency → community trust signal",   "low",    "Report published; 1,240 unique readers in 6h",            hoursAgo(23)),
      ],
    },
    {
      id: "governance-agent", name: "Governance Agent", domain: "governance",
      icon: "🗳️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 63, tasksActive: 1, tasksFailed: 1, cycleCount: 92,
      autonomyLevel: 77,
      capabilities: ["proposal-generation", "vote-monitoring", "dao-coordination", "policy-simulation", "quorum-detection"],
      linkedEngineName: "Autonomous Governance Engine (AGE)", linkedEnginePort: 9978,
      decisions: [
        mkDecision("governance-agent", "Generate GIP-047",          "Validator rewards below market rate; exodus risk",    "high",   "GIP-047 submitted: +8% validator rewards; 72h vote window",  minsAgo(60)),
        mkDecision("governance-agent", "Quorum achieved: GIP-045",  "Vote count crossed 67% threshold",                   "medium", "GIP-045 passed (74% yes); treasury release scheduled",        hoursAgo(4)),
        mkDecision("governance-agent", "Coordination with GhostDAO","GhostDAO inactive > 14 days; prompt required",        "low",    "Governance reminder sent to 840 DAO token holders",           hoursAgo(9)),
        mkDecision("governance-agent", "Policy simulation: GIP-046","Pre-vote impact modelling requested by community",    "medium", "Simulation: +2.1% APY for stakers, -4% emission rate",        hoursAgo(15)),
        mkDecision("governance-agent", "Block duplicate proposal",   "GIP-048 duplicates GIP-047 substance",               "low",    "GIP-048 flagged as duplicate; author notified",               hoursAgo(21)),
      ],
    },
    {
      id: "economy-agent", name: "Economy Agent", domain: "economy",
      icon: "💰", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 142, tasksActive: 1, tasksFailed: 6, cycleCount: 92,
      autonomyLevel: 88,
      capabilities: ["tokenomics-tuning", "burn-execution", "liquidity-rebalancing", "treasury-management", "emission-control"],
      linkedEngineName: "Autonomous Economy Engine (AEE)", linkedEnginePort: 9974,
      decisions: [
        mkDecision("economy-agent", "Execute token burn",          "Buy-back threshold met; burn queue ready",            "high",   "340K GST burned (0.034% supply); price impact +0.8%",    minsAgo(20)),
        mkDecision("economy-agent", "Rebalance GST/ETH pool",     "GST/ETH pool imbalanced 62/38 (target 50/50)",        "medium", "Added $82K ETH liquidity; ratio restored to 51/49",      hoursAgo(5)),
        mkDecision("economy-agent", "Adjust emission schedule",   "Inflation rate 4.2% vs target 3.8%",                 "medium", "Emission reduced by 2.1%; validator impact negligible",   hoursAgo(11)),
        mkDecision("economy-agent", "Treasury diversification",   "Treasury 94% GST; correlation risk flag raised",      "high",   "Allocated 5% to stablecoins ($320K); risk reduced",       hoursAgo(17)),
        mkDecision("economy-agent", "Activate staking rewards",   "New staking tier unlocked by governance vote",        "medium", "3.2% APY boost activated for 30-day lock tier",           hoursAgo(22)),
      ],
    },
    {
      id: "interchain-agent", name: "Interchain Agent", domain: "interchain",
      icon: "🌐", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 74, tasksActive: 3, tasksFailed: 2, cycleCount: 92,
      autonomyLevel: 82,
      capabilities: ["chain-discovery", "bridge-deployment", "liquidity-expansion", "cross-chain-messaging", "wrapped-asset-launch"],
      linkedEngineName: "Interchain Expansion Engine (GIE-X)", linkedEnginePort: 9979,
      decisions: [
        mkDecision("interchain-agent", "Deploy Arbitrum bridge",   "Arbitrum score 78/100; high EVM compat + liquidity",  "high",   "Bridge deployment initiated; estimated live in 48h",      minsAgo(90)),
        mkDecision("interchain-agent", "Relay cross-chain msgs",   "142 messages queued across 4 destination chains",     "medium", "142/142 relayed; 1 retry, 0 failures; avg 4.2s latency", hoursAgo(3)),
        mkDecision("interchain-agent", "Launch Optimism wGST pool","Optimism user base 2.1M; GST footprint zero",         "high",   "GST/USDC pool live on Optimism; $120K seed liquidity",    hoursAgo(8)),
        mkDecision("interchain-agent", "Pause Base bridge",        "Anomalous bridge withdraw pattern detected",          "critical","Base bridge paused; 0 user funds at risk; audit begun",  hoursAgo(13)),
        mkDecision("interchain-agent", "Near chain discovery",     "Near scored 44/100; flag for future evaluation",     "low",     "Near added to target list; re-evaluate at score > 55",   hoursAgo(20)),
      ],
    },
    // ── Role-based agents (GAAN Tier 2) ──────────────────────────────────────
    {
      id: "architect-agent", name: "Architect Agent", domain: "architect",
      icon: "🏛️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 42, tasksActive: 1, tasksFailed: 2, cycleCount: 42,
      autonomyLevel: 89,
      capabilities: ["protocol-design", "upgrade-planning", "scaling-architecture", "zk-research", "cross-layer-coordination"],
      linkedEngineName: "Ghost Autonomous AI Agent Network (GAAN)", linkedEnginePort: 9981,
      decisions: [
        mkDecision("architect-agent", "Propose GhostL3 compression layer",   "L2 data availability cost rising; compression reduces settlement cost 40%", "high",   "Blueprint drafted; estimated 40% DA cost reduction; governance proposal ready",  hoursAgo(2)),
        mkDecision("architect-agent", "Design validator sharding scheme",     "Validator set growth requires sharding for decentralisation",              "high",   "Sharding design complete; reduces per-node load by 30%; ready for v3.0 roadmap", hoursAgo(8)),
        mkDecision("architect-agent", "Initiate ZK-proof research track",     "Competitors adopting ZK-EVMs; proactive research required",               "medium", "Research task initiated; 6-week timeline; findings target Q3 roadmap",           hoursAgo(14)),
        mkDecision("architect-agent", "Architectural review completed",       "Monthly review; all interfaces validated against spec",                   "low",    "12 active proposals tracked; no blocking design debt found",                     hoursAgo(20)),
        mkDecision("architect-agent", "Bridge contract v2 specification",     "Current bridge hits throughput ceiling at 400 msg/s",                    "high",   "v2 spec complete; estimated 4× throughput; security review scheduled",           hoursAgo(30)),
      ],
    },
    {
      id: "auditor-agent", name: "Auditor Agent", domain: "auditor",
      icon: "🔍", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 58, tasksActive: 1, tasksFailed: 3, cycleCount: 58,
      autonomyLevel: 92,
      capabilities: ["smart-contract-audit", "deployment-verification", "config-compliance", "post-mortem-analysis", "security-checklist"],
      linkedEngineName: "Ghost Autonomous AI Agent Network (GAAN)", linkedEnginePort: 9981,
      decisions: [
        mkDecision("auditor-agent", "Audit passed — clean deploy approved",           "All 62 audit checks passed; zero findings; coverage 94%",                       "low",      "Deployment authorised; clean pass; zero findings",                       minsAgo(20)),
        mkDecision("auditor-agent", "Deployment halted — critical issue",             "Reentrancy vulnerability in bridge withdraw function (severity: critical)",     "critical",  "Deployment blocked; issue #6 logged; dev team notified; fix ETA 4h",    hoursAgo(6)),
        mkDecision("auditor-agent", "Deployment approved with warnings",              "2 low-severity gas optimisation issues; non-blocking per threshold",             "medium",   "Deployment approved; 2 warnings logged; follow-up Q3 ticket created",   hoursAgo(12)),
        mkDecision("auditor-agent", "Infrastructure audit passed",                    "Config matches approved baseline; no drift detected",                           "low",      "38 infra checks passed; all nodes within spec",                         hoursAgo(18)),
        mkDecision("auditor-agent", "Deployment rejected — audit failed",             "4 high-severity findings; deployment standard requires zero",                   "high",     "Audit failed; 4 items require remediation; re-audit after fixes",        hoursAgo(24)),
      ],
    },
    {
      id: "defender-agent", name: "Defender Agent", domain: "defender",
      icon: "⚔️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 71, tasksActive: 2, tasksFailed: 1, cycleCount: 71,
      autonomyLevel: 96,
      capabilities: ["ddos-mitigation", "exploit-blocking", "node-isolation", "sybil-detection", "eclipse-countermeasures"],
      linkedEngineName: "Ghost Autonomous AI Agent Network (GAAN)", linkedEnginePort: 9981,
      decisions: [
        mkDecision("defender-agent", "DDoS mitigation activated",              "Inbound RPC rate 28,000 req/s (baseline: 400 req/s)",                    "high",     "Rate-limit tiers activated; 3,200 IPs blocked; latency restored <120ms",  minsAgo(30)),
        mkDecision("defender-agent", "Sybil attack suppressed",                "340 wallet addresses sharing stake origin; identity clustering confirmed","high",     "340 Sybil entities blocked; network peer diversity score 88%",            hoursAgo(4)),
        mkDecision("defender-agent", "Eclipse attack countermeasure deployed",  "2 nodes receiving only attacker-controlled peer connections",             "high",     "2 nodes reconnected to diverse peers; propagation normalised",             hoursAgo(9)),
        mkDecision("defender-agent", "Perimeter defences reviewed",             "Scheduled review; no active threats detected",                           "low",      "Defences current; 4,820 addresses blocked; posture: normal",              hoursAgo(15)),
        mkDecision("defender-agent", "Insider threat response",                "Admin API call from off-hours IP; no change request filed",              "critical",  "Credentials suspended; session terminated; 72h forensic hold initiated",  hoursAgo(22)),
      ],
    },
    {
      id: "strategist-agent", name: "Strategist Agent", domain: "strategist",
      icon: "♟️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 34, tasksActive: 1, tasksFailed: 2, cycleCount: 34,
      autonomyLevel: 85,
      capabilities: ["ecosystem-strategy", "partnership-formation", "market-expansion", "treasury-planning", "developer-incentives"],
      linkedEngineName: "Ghost Autonomous AI Agent Network (GAAN)", linkedEnginePort: 9981,
      decisions: [
        mkDecision("strategist-agent", "Partnership initiative: LayerZero",    "LayerZero integration expands cross-chain liquidity by est. 35%",        "high",   "Partnership #8 initiated; MOU drafted; announcement in 14 days",        minsAgo(45)),
        mkDecision("strategist-agent", "Market expansion: Southeast Asia",      "SEA crypto adoption +48% YoY; low GhostChain brand presence",            "high",   "SEA expansion plan #3 approved; $60K allocated; launch Q3",             hoursAgo(5)),
        mkDecision("strategist-agent", "Launch developer incentive program",    "Active dev count stagnant 4 weeks; incentive pool needed",               "high",   "$200K developer incentive pool #2 created; est. +55 new projects",      hoursAgo(11)),
        mkDecision("strategist-agent", "Strategic treasury allocation",         "Treasury >90% native token; diversification required",                  "medium", "$180K reallocated per strategy brief; treasury health improved 8%",     hoursAgo(17)),
        mkDecision("strategist-agent", "Community engagement initiative",       "Community sentiment dipped to 68%; engagement needed",                  "medium", "Initiative #22 launched; est. reach 18K community members",             hoursAgo(23)),
      ],
    },
    {
      id: "operator-agent", name: "Operator Agent", domain: "operator",
      icon: "⚙️", status: "idle", version: "1.0.0",
      registeredAt: hoursAgo(24), lastHeartbeat: minsAgo(1), lastRun: minsAgo(2),
      tasksCompleted: 89, tasksActive: 2, tasksFailed: 5, cycleCount: 89,
      autonomyLevel: 93,
      capabilities: ["node-deployment", "cluster-scaling", "rollout-management", "rollback-automation", "hcl-coordination"],
      linkedEngineName: "Ghost Autonomous AI Agent Network (GAAN)", linkedEnginePort: 9981,
      decisions: [
        mkDecision("operator-agent", "Deploy: GhostL2 sequencer",    "Deployment pipeline triggered by successful auditor approval",              "medium", "GhostL2 sequencer deployed (#34); zero downtime; health checks passing",  minsAgo(15)),
        mkDecision("operator-agent", "Scale out: +2 validator node(s)","Network load at 88% capacity; threshold was 80%",                          "high",   "+2 validators added; total: 8; load reduced to 54%; SLA restored",       hoursAgo(3)),
        mkDecision("operator-agent", "Rollback initiated",              "Error rate spike post-deploy; automatic rollback threshold exceeded",      "high",   "Stable version restored in 92s; error rate back to baseline; filed",    hoursAgo(7)),
        mkDecision("operator-agent", "Scheduled maintenance executed",  "TLS certificates expiring in 7 days; proactive renewal",                  "low",    "Maintenance complete; 6 nodes healthy; uptime 99.94%",                  hoursAgo(13)),
        mkDecision("operator-agent", "Network health monitoring cycle",  "Continuous monitoring; all systems nominal",                             "low",    "6/6 nodes healthy; avg CPU 48%; avg mem 59%; all chains producing",     hoursAgo(19)),
      ],
    },
  ];

  for (const agent of SEED) {
    agents.set(agent.id, agent);
  }
  logger.info(`[AgentRegistry] Seeded ${agents.size} agents`);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getAllAgents(): RegisteredAgent[] {
  return [...agents.values()];
}

export function getAgentById(id: string): RegisteredAgent | undefined {
  return agents.get(id);
}

export function updateAgentStatus(id: string, status: AgentStatus, currentTask?: string): boolean {
  const a = agents.get(id);
  if (!a) return false;
  a.status         = status;
  a.lastHeartbeat  = Date.now();
  a.currentTask    = status === "running" ? (currentTask ?? a.currentTask) : undefined;
  if (status === "running")  a.tasksActive++;
  if (status === "idle")     a.tasksActive = Math.max(0, a.tasksActive - 1);
  agents.set(id, a);
  return true;
}

export function recordDecision(agentId: string, action: string, reasoning: string, impact: ImpactLevel, outcome: string): AgentDecision {
  const a = agents.get(agentId);
  if (!a) throw new Error(`Agent ${agentId} not found`);
  const d = mkDecision(agentId, action, reasoning, impact, outcome);
  a.decisions.unshift(d);
  if (a.decisions.length > MAX_DECISIONS) a.decisions.pop();
  a.lastRun       = Date.now();
  a.lastHeartbeat = Date.now();
  a.cycleCount++;
  a.tasksCompleted++;
  agents.set(agentId, a);
  return d;
}

export function getNetworkStats(): {
  total: number; idle: number; running: number; error: number; paused: number;
  totalDecisions: number; avgAutonomy: number;
} {
  const all  = getAllAgents();
  const byStatus = (s: AgentStatus) => all.filter(a => a.status === s).length;
  return {
    total:          all.length,
    idle:           byStatus("idle"),
    running:        byStatus("running"),
    error:          byStatus("error"),
    paused:         byStatus("paused"),
    totalDecisions: all.reduce((s, a) => s + a.decisions.length, 0),
    avgAutonomy:    all.length ? Math.round(all.reduce((s, a) => s + a.autonomyLevel, 0) / all.length) : 0,
  };
}

export function getRecentDecisions(limit = 20, agentId?: string, impact?: ImpactLevel): AgentDecision[] {
  let all: AgentDecision[] = [];
  for (const agent of agents.values()) {
    if (agentId && agent.id !== agentId) continue;
    all.push(...(impact ? agent.decisions.filter(d => d.impact === impact) : agent.decisions));
  }
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
