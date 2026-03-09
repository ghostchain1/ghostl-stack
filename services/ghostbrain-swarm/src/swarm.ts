import { fetch, type Response } from "undici";
import { AGENT_URLS, PROBE_TIMEOUT_MS, TASK_TIMEOUT_MS, HEARTBEAT_INTERVAL_MS } from "./config.js";
import type {
  AgentDescriptor,
  AgentId,
  AgentRole,
  AgentStatus,
  SwarmTask,
  TaskResult,
  QuorumResult,
} from "./types.js";

//─── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<AgentId, AgentDescriptor>();
let heartbeatTimer: NodeJS.Timeout | undefined;

/** Initialise the registry from configured URLs. */
export function initRegistry(): void {
  for (const [role, url] of Object.entries(AGENT_URLS)) {
    const id = role as AgentRole;
    registry.set(id, {
      id,
      role: id as AgentRole,
      url,
      status: "offline",
      lastSeen: 0,
      latency: -1,
      taskCount: 0,
    });
  }
}

export function getRegistry(): AgentDescriptor[] {
  return Array.from(registry.values());
}

export function getAgent(id: AgentId): AgentDescriptor | undefined {
  return registry.get(id);
}

//─── Heartbeat probing ────────────────────────────────────────────────────────

async function probeAgent(agent: AgentDescriptor): Promise<void> {
  const start = Date.now();
  let res: Response | undefined;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    res = await fetch(`${agent.url}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;
    const ok = res.ok;
    agent.status  = ok ? "online" : "degraded";
    agent.latency = latency;
    if (ok) agent.lastSeen = Date.now();
  } catch {
    agent.status  = "offline";
    agent.latency = -1;
  }
}

export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    await Promise.allSettled(
      Array.from(registry.values()).map(a => probeAgent(a))
    );
  }, HEARTBEAT_INTERVAL_MS);
  // Initial probe
  void Promise.allSettled(
    Array.from(registry.values()).map(a => probeAgent(a))
  );
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

//─── Task routing ─────────────────────────────────────────────────────────────

/** Pick the best available agent for a given role. */
function pickAgent(role?: AgentRole): AgentDescriptor | undefined {
  const candidates = Array.from(registry.values()).filter(a =>
    a.status === "online" && (!role || a.role === role)
  );
  if (candidates.length === 0 && role) {
    // Fallback: any online agent
    return Array.from(registry.values()).find(a => a.status === "online");
  }
  // Pick lowest task count (load balancing)
  return candidates.sort((a, b) => a.taskCount - b.taskCount)[0];
}

/** Roles served by ghost-ai-swarm-v2 — use /tasks endpoint with targetRole field */
const SWARM_V2_ROLES = new Set([
  "architect","executor","auditor","network","node",
  "treasury","market","dex","lend","security","fraud","dao",
]);

async function dispatchToAgent(
  agent: AgentDescriptor,
  task: SwarmTask
): Promise<TaskResult> {
  const start = Date.now();
  agent.taskCount++;

  // Swarm v2 agents expect POST /tasks with { targetRole, type, payload }
  const isSwarmV2 = SWARM_V2_ROLES.has(agent.role);
  const endpoint  = isSwarmV2 ? `${agent.url}/tasks` : `${agent.url}/task`;
  const body      = isSwarmV2
    ? JSON.stringify({ targetRole: agent.role, type: task.type, payload: task.payload })
    : JSON.stringify({ taskId: task.id, type: task.type, payload: task.payload });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TASK_TIMEOUT_MS);
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body,
      signal:  ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        taskId:     task.id,
        agentId:    agent.id,
        agentRole:  agent.role,
        output:     {},
        durationMs: Date.now() - start,
        success:    false,
        error:      `HTTP ${res.status}: ${body}`,
      };
    }

    const output = (await res.json()) as Record<string, unknown>;
    return {
      taskId:     task.id,
      agentId:    agent.id,
      agentRole:  agent.role,
      output,
      durationMs: Date.now() - start,
      success:    true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      taskId:     task.id,
      agentId:    agent.id,
      agentRole:  agent.role,
      output:     {},
      durationMs: Date.now() - start,
      success:    false,
      error:      msg,
    };
  }
}

//─── Quorum execution ─────────────────────────────────────────────────────────

/**
 * Execute a task, gathering `task.quorum` independent results and
 * returning a QuorumResult with simple majority consensus on the output.
 */
export async function executeTask(task: SwarmTask): Promise<QuorumResult> {
  const needed = Math.min(task.quorum, registry.size);
  const usedIds = new Set<AgentId>();
  const pending: Promise<TaskResult>[] = [];

  // Prefer pinned role first
  const primary = pickAgent(task.targetRole);
  if (primary) {
    usedIds.add(primary.id);
    pending.push(dispatchToAgent(primary, task));
  }

  // Fill remaining quorum slots with any online agents
  for (const agent of registry.values()) {
    if (pending.length >= needed) break;
    if (usedIds.has(agent.id)) continue;
    if (agent.status !== "online") continue;
    usedIds.add(agent.id);
    pending.push(dispatchToAgent(agent, task));
  }

  if (pending.length === 0) {
    return { taskId: task.id, results: [], reached: false };
  }

  const results = await Promise.allSettled(pending).then(settled =>
    settled.map(s => (s.status === "fulfilled" ? s.value : null)).filter((r): r is TaskResult => r !== null)
  );

  const successes = results.filter(r => r.success);
  const reached   = successes.length >= needed;

  // Simple consensus: return the first successful output (extendable to voting)
  const consensus = successes[0]?.output;

  return { taskId: task.id, results, reached, consensus };
}
