/**
 * ai.ts — GhostBrain Core service client.
 *
 * All calls go through the BFF `/api/ai/*` which proxies to GhostBrain Core
 * running on port 7900. No direct connections to ghostbrain-core from the
 * browser — keeps the AI port internal.
 *
 * AI may draft actions; humans must ratify via the Approve/Reject workflow.
 */

export type RecommendationSeverity = 'info' | 'warning' | 'critical';
export type RecommendationStatus   = 'pending' | 'approved' | 'rejected' | 'auto-executed' | 'expired';
export type AIActionType           = 'rebalance' | 'restart' | 'upgrade' | 'alert' | 'governance' | 'treasury';

export interface AIRecommendation {
  id: string;
  createdAt: string;
  expiresAt: string;
  severity: RecommendationSeverity;
  status: RecommendationStatus;
  actionType: AIActionType;
  target: string;
  title: string;
  reasoning: string;
  evidence: Array<{ kind: string; ref: string; detail: string }>;
  proposedPayload: Record<string, unknown>;
  confidence: number;      // 0-1
  autoExecuteEligible: boolean;
  model: { name: string; version: string };
}

export interface AISwarmStatus {
  agentCount: number;
  activeAgents: number;
  queueDepth: number;
  tasksCompleted24h: number;
  memoryUsageMb: number;
  anomaliesDetected24h: number;
  uptime: string;
}

export interface AIRiskScore {
  layer: string;
  score: number;           // 0-100
  trend: 'rising' | 'falling' | 'stable';
  topReasons: string[];
  computedAt: string;
}

export interface AINetworkHealth {
  l1: AIRiskScore;
  l2: AIRiskScore;
  l3: AIRiskScore;
  compositeScore: number;
  alertLevel: 'green' | 'yellow' | 'red';
}

// ── Internal helper ────────────────────────────────────────────────────────────

async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`AI BFF ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch pending AI recommendations that require human ratification. */
export async function fetchAIRecommendations(
  status: RecommendationStatus = 'pending',
): Promise<AIRecommendation[]> {
  return bff<AIRecommendation[]>(`/api/ai/recommendations?status=${status}`);
}

/** Approve a recommendation (queues it for execution via signing relay). */
export async function approveRecommendation(id: string): Promise<void> {
  await bff<unknown>(`/api/ai/recommendations/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Reject a recommendation with an optional reason. */
export async function rejectRecommendation(id: string, reason?: string): Promise<void> {
  await bff<unknown>(`/api/ai/recommendations/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? 'rejected by operator' }),
  });
}

/** Fetch live GhostBrain swarm status. */
export async function fetchSwarmStatus(): Promise<AISwarmStatus> {
  return bff<AISwarmStatus>('/api/ai/swarm/status');
}

/** Fetch AI-computed network health / risk scores across all layers. */
export async function fetchNetworkHealth(): Promise<AINetworkHealth> {
  return bff<AINetworkHealth>('/api/ai/network-health');
}
