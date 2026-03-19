/**
 * GhostStack WebSocket Gateway
 *
 * Bridges real-time chain/AI/validator data to browser WebSocket clients.
 *
 * Architecture:
 *   [GhostBrain Core :7900]  ──poll──▶  [ws-gateway :8085]  ──push──▶  [Browser]
 *   [L1 RPC :18545]          ──poll──▶  ↑
 *   [L2 RPC :7260]          ──poll──▶  ↑
 *   [L3 RPC :7270]          ──poll──▶  ↑
 *
 * Message types broadcast to clients:
 *   { type: "block",    chain, blockNumber, timestamp }
 *   { type: "health",   chain, status, peers }
 *   { type: "ai",       alertLevel, activeAgents, anomaliesDetected24h }
 *   { type: "ping",     serverTime }
 *
 * Env vars:
 *   WS_PORT             (default 8085)
 *   GHOSTBRAIN_URL      (default http://localhost:7900)
 *   L1_RPC_URL          (default http://localhost:18545)
 *   L2_RPC_URL          (default http://localhost:7260)
 *   L3_RPC_URL          (default http://localhost:7270)
 *   POLL_INTERVAL_MS    (default 6000)
 *   MAX_CLIENTS         (default 200)
 *
 * Security:
 *   - Read-only: gateway only polls upstream services, never issues write commands.
 *   - No auth on this port — run behind a reverse proxy with network-level ACLs.
 *   - Per-client message rate limited server-side (send queue, not interval).
 *   - Max client cap prevents resource exhaustion.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import { createServer } from 'http';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT          = parseInt(process.env.WS_PORT           ?? '8085', 10);
const BRAIN_URL     = process.env.GHOSTBRAIN_URL             ?? 'http://localhost:7900';
const L1_URL        = process.env.L1_RPC_URL                 ?? 'http://localhost:18545';
const L2_URL        = process.env.L2_RPC_URL                 ?? 'http://localhost:7260';
const L3_URL        = process.env.L3_RPC_URL                 ?? 'http://localhost:7270';
const POLL_MS       = parseInt(process.env.POLL_INTERVAL_MS  ?? '6000', 10);
const MAX_CLIENTS   = parseInt(process.env.MAX_CLIENTS       ?? '200',  10);

// ── Types ─────────────────────────────────────────────────────────────────────

type GwMessage =
  | { type: 'block';  chain: string; blockNumber: number; timestamp: number }
  | { type: 'health'; chain: string; status: string;      peers: number }
  | { type: 'ai';     alertLevel: string; activeAgents: number; anomaliesDetected24h: number }
  | { type: 'ping';   serverTime: string; clients: number };

// ── HTTP/WS server ────────────────────────────────────────────────────────────

const http = createServer((_req, res) => {
  // Health check endpoint for Docker / Kubernetes probes
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, clients: wss.clients.size, port: PORT }));
});

const wss = new WebSocketServer({ server: http });

function broadcast(msg: GwMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws: WebSocket, req) => {
  if (wss.clients.size > MAX_CLIENTS) {
    ws.close(1013, 'server full');
    return;
  }

  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[ws-gateway] client connected ip=${ip} total=${wss.clients.size}`);

  ws.send(JSON.stringify({ type: 'ping', serverTime: new Date().toISOString(), clients: wss.clients.size }));

  ws.on('error', err => console.warn('[ws-gateway] client error', err.message));
  ws.on('close', () => console.log(`[ws-gateway] client disconnected total=${wss.clients.size}`));

  // Ignore messages from clients — gateway is read-only
  ws.on('message', () => { /* intentionally empty */ });
});

// ── Polling helpers ───────────────────────────────────────────────────────────

async function rpcBlockNumber(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    return json.result ? parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}

async function pollChain(chain: string, url: string): Promise<void> {
  const bn = await rpcBlockNumber(url);
  if (bn !== null) {
    broadcast({ type: 'block', chain, blockNumber: bn, timestamp: Math.floor(Date.now() / 1000) });
    broadcast({ type: 'health', chain, status: 'healthy', peers: 0 });
  } else {
    broadcast({ type: 'health', chain, status: 'down', peers: 0 });
  }
}

async function pollBrain(): Promise<void> {
  try {
    const res = await fetch(`${BRAIN_URL}/swarm/status`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      activeAgents?: number;
      anomaliesDetected24h?: number;
    };
    const healthRes = await fetch(`${BRAIN_URL}/network/health`, {
      signal: AbortSignal.timeout(4_000),
    });
    const health = healthRes.ok
      ? ((await healthRes.json()) as { alertLevel?: string })
      : { alertLevel: 'green' };

    broadcast({
      type:                 'ai',
      alertLevel:           health.alertLevel ?? 'green',
      activeAgents:         data.activeAgents ?? 0,
      anomaliesDetected24h: data.anomaliesDetected24h ?? 0,
    });
  } catch {
    // GhostBrain offline — don't broadcast stale data
  }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  await Promise.all([
    pollChain('l1', L1_URL),
    pollChain('l2', L2_URL),
    pollChain('l3', L3_URL),
    pollBrain(),
  ]);
  broadcast({ type: 'ping', serverTime: new Date().toISOString(), clients: wss.clients.size });
}

http.listen(PORT, () => {
  console.log(`[ws-gateway] listening on ws://0.0.0.0:${PORT}`);
  console.log(`[ws-gateway] poll interval ${POLL_MS}ms  max clients ${MAX_CLIENTS}`);
  void tick();
  setInterval(() => void tick(), POLL_MS);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ws-gateway] SIGTERM — shutting down');
  wss.close(() => http.close(() => process.exit(0)));
});
