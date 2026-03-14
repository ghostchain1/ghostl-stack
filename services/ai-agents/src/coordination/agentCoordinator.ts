/**
 * GAAN — Agent Coordinator
 * Orchestrates the task lifecycle across all agents:
 *   • Generates tasks from ecosystem signals
 *   • Assigns pending tasks to idle agents
 *   • Tracks progress and reports outcomes
 *   • Computes network-level health snapshot
 */

import { v4 as uuid } from "uuid";
import logger from "../utils/logger";
import { getAllAgents, getNetworkStats, type AgentDomain } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

export type TaskStatus   = "pending" | "in-progress" | "completed" | "failed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface CoordinationTask {
  id:           string;
  type:         string;
  title:        string;
  description:  string;
  domain:       AgentDomain;
  assignedTo?:  string;         // agent id
  priority:     TaskPriority;
  status:       TaskStatus;
  createdAt:    number;
  startedAt?:   number;
  completedAt?: number;
  result?:      string;
  createdBy:    string;         // agent id | "coordinator" | "manual"
}

export interface CoordinationCycleResult {
  cycleId:        string;
  timestamp:      number;
  tasksCreated:   number;
  tasksAssigned:  number;
  tasksCompleted: number;
  agentsActive:   number;
  networkHealth:  number;
  messages:       string[];
}

export interface NetworkSnapshot {
  timestamp:     number;
  agents:        ReturnType<typeof getNetworkStats>;
  tasks:         { total: number; pending: number; inProgress: number; completed: number; failed: number; completionRate: number };
  messages:      { total: number; unread: number };
  networkHealth: number;     // 0-100
  autonomyScore: number;     // 0-100
  cycleCount:    number;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const tasks:   CoordinationTask[] = [];
const MAX_TASKS = 300;

let cycleCount      = 0;
let networkHealth   = 91;
const snapshots: NetworkSnapshot[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

const hoursAgo  = (h: number): number => Date.now() - h * 3_600_000;
const minsAgo   = (m: number): number => Date.now() - m * 60_000;
const rand      = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const jitter    = (base: number, pct = 3): number => Math.max(0, Math.min(100, base + rand(-pct, pct)));

// ── Seed ──────────────────────────────────────────────────────────────────────

export function seedTasks(): void {
  const SEED: CoordinationTask[] = [
    {
      id: uuid(), type: "scale-infrastructure", domain: "infrastructure",
      title: "Scale GhostL2 sequencer capacity",
      description: "GhostL2 throughput at 78% ceiling; scale sequencer to handle marketing surge",
      assignedTo: "infrastructure-agent", priority: "high", status: "completed",
      createdAt: hoursAgo(3), startedAt: hoursAgo(3), completedAt: hoursAgo(2.5),
      result: "Sequencer scaled from 500 → 1000 TPS; latency reduced 40%", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "threat-mitigation", domain: "security",
      title: "Mitigate bot attack on token contract",
      description: "Coordinated bot activity attempting contract exploit pattern",
      assignedTo: "security-agent", priority: "critical", status: "completed",
      createdAt: hoursAgo(1.8), startedAt: hoursAgo(1.8), completedAt: hoursAgo(1.5),
      result: "2,340 IPs blocked; DDoS protection elevated; no funds at risk", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "campaign-launch", domain: "marketing",
      title: "GhostL2 launch awareness campaign",
      description: "Coordinate cross-channel campaign to capitalise on L2 launch milestone",
      assignedTo: "marketing-agent", priority: "high", status: "completed",
      createdAt: hoursAgo(2), startedAt: hoursAgo(2), completedAt: minsAgo(25),
      result: "Campaign live across 4 channels; 84K impressions day-1", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "grant-distribution", domain: "growth",
      title: "Process Q1 developer grants",
      description: "3 grant applications scored > 85/100 pending disbursement",
      assignedTo: "growth-agent", priority: "medium", status: "completed",
      createdAt: hoursAgo(5), startedAt: hoursAgo(5), completedAt: minsAgo(40),
      result: "$45K distributed across 3 grants; projects onboarding to GhostL2", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "governance-proposal", domain: "governance",
      title: "Generate and submit GIP-047",
      description: "Validator reward gap identified; generate proposal to increase rewards 8%",
      assignedTo: "governance-agent", priority: "medium", status: "completed",
      createdAt: hoursAgo(4), startedAt: hoursAgo(4), completedAt: minsAgo(55),
      result: "GIP-047 submitted; 72h vote window open; 34% participation so far", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "economy-adjustment", domain: "economy",
      title: "Execute scheduled GST token burn",
      description: "Buy-back threshold crossed; execute 340K GST burn from treasury",
      assignedTo: "economy-agent", priority: "high", status: "completed",
      createdAt: hoursAgo(1), startedAt: hoursAgo(1), completedAt: minsAgo(18),
      result: "340K GST burned; effective supply: 999.66M; price impact +0.8%", createdBy: "coordinator",
    },
    {
      id: uuid(), type: "chain-expansion", domain: "interchain",
      title: "Deploy Arbitrum bridge",
      description: "Arbitrum scored 78/100; high EVM compatibility and liquidity pool depth",
      assignedTo: "interchain-agent", priority: "high", status: "in-progress",
      createdAt: minsAgo(90), startedAt: minsAgo(88),
      result: undefined, createdBy: "coordinator",
    },
    {
      id: uuid(), type: "scale-infrastructure", domain: "infrastructure",
      title: "Provision relay nodes for Arbitrum bridge",
      description: "2 dedicated relay nodes needed for Arbitrum bridge messaging",
      assignedTo: "infrastructure-agent", priority: "high", status: "completed",
      createdAt: minsAgo(88), startedAt: minsAgo(87), completedAt: minsAgo(80),
      result: "relay-arb-01 and relay-arb-02 live and synced", createdBy: "infrastructure-agent",
    },
    {
      id: uuid(), type: "campaign-launch", domain: "marketing",
      title: "Developer documentation series",
      description: "Developer funnel CTR below target; create 3-part tutorial series for GhostL2 EVM",
      assignedTo: "marketing-agent", priority: "medium", status: "in-progress",
      createdAt: minsAgo(30), startedAt: minsAgo(28),
      result: undefined, createdBy: "coordinator",
    },
    {
      id: uuid(), type: "governance-proposal", domain: "governance",
      title: "Close expired governance proposals",
      description: "GIP-043 and GIP-044 past vote deadline; archive and close",
      assignedTo: "governance-agent", priority: "low", status: "pending",
      createdAt: minsAgo(10),
      result: undefined, createdBy: "coordinator",
    },
    {
      id: uuid(), type: "economy-adjustment", domain: "economy",
      title: "Rebalance cross-chain liquidity pools",
      description: "3 pools out of target ratio by > 10%; rebalance before APY degradation",
      assignedTo: "economy-agent", priority: "medium", status: "pending",
      createdAt: minsAgo(15),
      result: undefined, createdBy: "coordinator",
    },
    {
      id: uuid(), type: "chain-expansion", domain: "interchain",
      title: "Evaluate Optimism for wGST expansion",
      description: "Optimism scored 73/100; assess pool depth and deploy wGST contract",
      priority: "medium", status: "pending",
      createdAt: minsAgo(8),
      result: undefined, createdBy: "coordinator",
    },
  ];

  tasks.push(...SEED);
  cycleCount = 92;
  logger.info(`[Coordinator] Seeded ${tasks.length} tasks`);
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export function createTask(input: Pick<CoordinationTask, "type" | "title" | "description" | "domain" | "priority" | "createdBy"> & { assignedTo?: string }): CoordinationTask {
  const t: CoordinationTask = {
    id: uuid(), ...input,
    status: input.assignedTo ? "in-progress" : "pending",
    createdAt: Date.now(),
    startedAt: input.assignedTo ? Date.now() : undefined,
  };
  tasks.unshift(t);
  if (tasks.length > MAX_TASKS) tasks.pop();
  return t;
}

export function assignTask(taskId: string, agentId: string): boolean {
  const t = tasks.find(x => x.id === taskId);
  if (!t || t.status !== "pending") return false;
  t.assignedTo = agentId;
  t.status     = "in-progress";
  t.startedAt  = Date.now();
  return true;
}

export function completeTask(taskId: string, result: string, failed = false): boolean {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return false;
  t.status      = failed ? "failed" : "completed";
  t.completedAt = Date.now();
  t.result      = result;
  return true;
}

export function updateTaskStatus(taskId: string, status: TaskStatus, result?: string): boolean {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return false;
  t.status = status;
  if (result) t.result = result;
  if (status === "completed" || status === "failed") t.completedAt = Date.now();
  return true;
}

export interface GetTasksOpts {
  status?:     TaskStatus;
  domain?:     AgentDomain;
  assignedTo?: string;
  priority?:   TaskPriority;
  limit?:      number;
}

export function getTasks(opts: GetTasksOpts = {}): CoordinationTask[] {
  let r = [...tasks];
  if (opts.status)     r = r.filter(t => t.status     === opts.status);
  if (opts.domain)     r = r.filter(t => t.domain     === opts.domain);
  if (opts.assignedTo) r = r.filter(t => t.assignedTo === opts.assignedTo);
  if (opts.priority)   r = r.filter(t => t.priority   === opts.priority);
  return r.slice(0, opts.limit ?? 50);
}

export function getTaskStats(): { total: number; pending: number; inProgress: number; completed: number; failed: number; completionRate: number } {
  const total     = tasks.length;
  const pending   = tasks.filter(t => t.status === "pending").length;
  const inProg    = tasks.filter(t => t.status === "in-progress").length;
  const done      = tasks.filter(t => t.status === "completed").length;
  const failed    = tasks.filter(t => t.status === "failed").length;
  return { total, pending, inProgress: inProg, completed: done, failed, completionRate: total ? Math.round((done / total) * 100) : 0 };
}

export function getTaskById(id: string): CoordinationTask | undefined {
  return tasks.find(t => t.id === id);
}

// ── Coordination cycle ────────────────────────────────────────────────────────

export function runCoordinationCycle(): CoordinationCycleResult {
  cycleCount++;
  const now      = Date.now();
  const msgs: string[] = [];
  let tasksCreated = 0; let tasksAssigned = 0; let tasksCompleted = 0;

  const agents    = getAllAgents();
  const idleAgents= agents.filter(a => a.status === "idle" && a.domain !== "infrastructure" || a.status === "idle");
  const pending   = getTasks({ status: "pending", limit: 20 });

  // Auto-assign unassigned pending tasks to matching idle agents
  for (const task of pending.filter(t => !t.assignedTo)) {
    const match = idleAgents.find(a => a.domain === task.domain && !pending.some(t2 => t2.assignedTo === a.id && t2.status === "in-progress"));
    if (match) {
      assignTask(task.id, match.id);
      tasksAssigned++;
      msgs.push(`Assigned "${task.title}" → ${match.name}`);
      sendMessage("coordinator", match.id, "command", "New task assigned", `Please execute: ${task.title}. Priority: ${task.priority}.`);
    }
  }

  // Auto-generate tasks from ecosystem signals (stochastic simulation)
  const signals: Array<{ prob: number; type: string; domain: AgentDomain; priority: TaskPriority; title: string; desc: string }> = [
    { prob: 0.15, type: "scale-infrastructure", domain: "infrastructure", priority: "medium", title: "Resource optimisation pass",        desc: "Periodic resource audit and rebalancing across validator cluster" },
    { prob: 0.10, type: "threat-mitigation",    domain: "security",       priority: "medium", title: "Routine threat scan",              desc: "Scheduled full-network threat scan and anomaly report" },
    { prob: 0.12, type: "campaign-launch",      domain: "marketing",      priority: "low",    title: "Weekly content calendar refresh",  desc: "Generate and schedule next 7 days of social content" },
    { prob: 0.10, type: "growth-action",        domain: "growth",         priority: "low",    title: "Developer lead outreach",          desc: "Identify and engage 50 high-potential developer leads on GitHub" },
    { prob: 0.08, type: "economy-adjustment",   domain: "economy",        priority: "medium", title: "Liquidity pool rebalancing check", desc: "Compare all pool ratios against targets; rebalance if > 5% drift" },
    { prob: 0.07, type: "governance-proposal",  domain: "governance",     priority: "low",    title: "Policy simulation run",            desc: "Run simulation on pending governance proposals before vote closes" },
    { prob: 0.08, type: "chain-expansion",      domain: "interchain",     priority: "medium", title: "Cross-chain metrics sweep",        desc: "Collect bridge volume, pool TVL, and message stats from all chains" },
  ];

  for (const sig of signals) {
    if (Math.random() < sig.prob) {
      createTask({ type: sig.type, title: sig.title, description: sig.desc, domain: sig.domain, priority: sig.priority, createdBy: "coordinator" });
      tasksCreated++;
      msgs.push(`Created task: "${sig.title}"`);
    }
  }

  // Progress some in-progress tasks (simulate completion)
  const inProgress = getTasks({ status: "in-progress", limit: 15 });
  for (const t of inProgress) {
    if (Math.random() < 0.25) {
      completeTask(t.id, `Task completed autonomously in cycle #${cycleCount}`);
      tasksCompleted++;
      msgs.push(`Completed: "${t.title}"`);
      if (t.assignedTo) {
        sendMessage(t.assignedTo, "coordinator", "info", "Task complete", `"${t.title}" finished successfully.`);
      }
    }
  }

  // Broadcast cycle summary
  sendMessage("coordinator", "all", "broadcast",
    `Coordination cycle #${cycleCount} complete`,
    `Tasks created: ${tasksCreated}, assigned: ${tasksAssigned}, completed: ${tasksCompleted}. Network health: ${networkHealth}/100.`
  );

  networkHealth = jitter(networkHealth, 2);

  const stats = getNetworkStats();
  logger.info(`[Coordinator] Cycle #${cycleCount} — created=${tasksCreated} assigned=${tasksAssigned} completed=${tasksCompleted}`);

  return { cycleId: uuid(), timestamp: now, tasksCreated, tasksAssigned, tasksCompleted, agentsActive: stats.running, networkHealth, messages: msgs };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export function takeNetworkSnapshot(): NetworkSnapshot {
  const agentStats = getNetworkStats();
  const taskStats  = getTaskStats();
  const snap: NetworkSnapshot = {
    timestamp:    Date.now(),
    agents:       agentStats,
    tasks:        taskStats,
    messages:     { total: 0, unread: 0 },   // filled by index.ts
    networkHealth,
    autonomyScore: agentStats.avgAutonomy,
    cycleCount,
  };
  snapshots.unshift(snap);
  if (snapshots.length > 288) snapshots.pop();
  return snap;
}

export function getLatestSnapshot(): NetworkSnapshot | null { return snapshots[0] ?? null; }
export function getSnapshotHistory(limit = 48): NetworkSnapshot[]  { return snapshots.slice(0, limit); }
export function getCycleCount(): number { return cycleCount; }
export function getNetworkHealth(): number { return networkHealth; }
