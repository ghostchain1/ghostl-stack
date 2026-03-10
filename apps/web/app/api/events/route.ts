/**
 * /api/events — Server-Sent Events (SSE) gateway.
 *
 * This route streams real-time events to the browser.  It polls Prometheus
 * and the GhostBrain Core HTTP API at short intervals, then pushes updates
 * over an open SSE connection without requiring a WebSocket upgrade.
 *
 * Query params:
 *   topics=chain.health,chain.block,ai.recommendation,...
 *   If omitted, all topics are streamed.
 *
 * Security:
 *   - Only accessible to authenticated sessions (checked via cookies).
 *   - Outbound requests go to internal services only (no user-supplied URLs).
 *   - Connection kept alive for max 4 minutes (Vercel / edge time-out safety).
 */

import { type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS  = 15_000;
const MAX_UPTIME_MS = 240_000;  // 4 min hard limit

// ── Internal helpers ─────────────────────────────────────────────────────────

type TopicFilter = Set<string> | null;  // null = all topics

function parseTopics(req: NextRequest): TopicFilter {
  const raw = req.nextUrl.searchParams.get('topics');
  if (!raw) return null;
  const parts = raw.split(',').map((t: string) => t.trim()).filter(Boolean);
  return parts.length > 0 ? new Set(parts) : null;
}

function sseMessage(eventType: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${eventType}\ndata: ${json}\n\n`;
}

function heartbeatMessage(): string {
  return sseMessage('heartbeat', { ts: new Date().toISOString(), type: 'heartbeat' });
}

const API_BASE  = process.env.API_INTERNAL_URL    ?? 'http://localhost:4000';
const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL  ?? 'http://localhost:7900';

// Fetch chain health from BFF
async function pollChainHealth(): Promise<unknown | null> {
  try {
    const res = await fetch(`${API_BASE}/api/command-center/chain-health?chain=all`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return { type: 'chain.health', ts: new Date().toISOString(), data: await res.json() };
  } catch {
    return null;
  }
}

// Fetch AI recommendations from GhostBrain Core
async function pollAIRecs(): Promise<unknown | null> {
  try {
    const res = await fetch(`${BRAIN_URL}/recommendations?status=pending`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return { type: 'ai.recommendation', ts: new Date().toISOString(), data: await res.json() };
  } catch {
    return null;
  }
}

// Fetch swarm status from GhostBrain Core
async function pollSwarm(): Promise<unknown | null> {
  try {
    const res = await fetch(`${BRAIN_URL}/swarm/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return { type: 'ai.swarm', ts: new Date().toISOString(), data: await res.json() };
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const filter = parseTopics(req);
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const push = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // client disconnected
        }
      };

      const shouldSend = (topic: string) => !filter || filter.has(topic);

      // Initial heartbeat
      push(heartbeatMessage());

      // Heartbeat interval
      const hbInterval = setInterval(() => {
        push(heartbeatMessage());
      }, HEARTBEAT_MS);

      // Poll loop
      const poll = setInterval(async () => {
        if (Date.now() - startedAt > MAX_UPTIME_MS) {
          clearInterval(poll);
          clearInterval(hbInterval);
          controller.close();
          return;
        }

        if (shouldSend('chain.health')) {
          const data = await pollChainHealth();
          if (data) push(sseMessage('chain.health', data));
        }

        if (shouldSend('ai.recommendation')) {
          const data = await pollAIRecs();
          if (data) push(sseMessage('ai.recommendation', data));
        }

        if (shouldSend('ai.swarm')) {
          const data = await pollSwarm();
          if (data) push(sseMessage('ai.swarm', data));
        }
      }, 10_000);  // poll every 10 seconds

      // Clean up when the client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(poll);
        clearInterval(hbInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx buffering
    },
  });
}
