/**
 * /api/ai — Unified AI status endpoint.
 *
 * Combines GhostBrain swarm status + network health into one response so
 * the dashboard AI widget needs only one fetch.
 *
 * Env vars:
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 */

import { NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

type SwarmStatus = {
  activeAgents?: number;
  agentCount?: number;
  queueDepth?: number;
  tasksCompleted24h?: number;
  anomaliesDetected24h?: number;
  memoryUsageMb?: number;
  uptime?: number;
};

type NetworkHealth = {
  alertLevel?: 'green' | 'yellow' | 'red';
  compositeScore?: number;
  l1?: { score: number };
  l2?: { score: number };
  l3?: { score: number };
};

async function grab<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BRAIN_URL}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [swarm, health] = await Promise.all([
    grab<SwarmStatus>('/swarm/status'),
    grab<NetworkHealth>('/network/health'),
  ]);

  const online = swarm !== null || health !== null;

  return NextResponse.json(
    {
      status: online ? 'online' : 'offline',
      alertLevel: health?.alertLevel ?? 'green',
      compositeScore: health?.compositeScore ?? null,
      swarm: {
        activeAgents:      swarm?.activeAgents      ?? 0,
        agentCount:        swarm?.agentCount        ?? 0,
        queueDepth:        swarm?.queueDepth        ?? 0,
        tasksCompleted24h: swarm?.tasksCompleted24h ?? 0,
        anomaliesDetected24h: swarm?.anomaliesDetected24h ?? 0,
        memoryUsageMb:     swarm?.memoryUsageMb     ?? 0,
      },
      network: {
        l1Score: health?.l1?.score ?? null,
        l2Score: health?.l2?.score ?? null,
        l3Score: health?.l3?.score ?? null,
      },
      recommendations: [
        ...(health?.alertLevel === 'red'    ? [{ message: 'Network alert level critical', action: 'investigate node health'  }] : []),
        ...(health?.alertLevel === 'yellow' ? [{ message: 'Network health degraded',     action: 'review chain metrics'     }] : []),
        ...((swarm?.anomaliesDetected24h ?? 0) > 0 ? [{ message: `${swarm?.anomaliesDetected24h} anomalies detected in 24h`, action: 'review GhostBrain alerts' }] : []),
      ],
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
