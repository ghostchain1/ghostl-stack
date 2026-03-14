// GhostBrain Swarm Agent — main process
// Detect-only: never executes remediation autonomously.
// All write actions are proposals routed through signing relay.
import http from 'http';
import { hostname } from 'os';
import { initBus, publish, isConnected } from './communication/swarmBus.js';
import type { AgentHeartbeat } from './communication/swarmProtocol.js';
import { runValidatorTask } from './tasks/validatorTask.js';
import { runNetworkTask } from './tasks/networkTask.js';
import { runSecurityTask } from './tasks/securityTask.js';
import { CONFIG } from './config/agentConfig.js';

const AGENT_ID = process.env.AGENT_ID ?? hostname();
const START_TIME = Date.now();

// ── Periodic task runner ──────────────────────────────────────────────────────

function scheduleRepeating(fn: () => Promise<void>, intervalMs: number, label: string): void {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[agent] ${label} error:`, err);
    }
    setTimeout(run, intervalMs);
  };
  // Stagger start to avoid thundering herd
  setTimeout(run, Math.min(intervalMs, 5_000));
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

function publishHeartbeat(): void {
  const hb: AgentHeartbeat = {
    agentId: AGENT_ID,
    nodeType: CONFIG.nodeType,
    status: 'healthy',
    uptimeSec: Math.floor((Date.now() - START_TIME) / 1_000),
    ts: new Date().toISOString(),
  };
  publish('agent.heartbeat', hb);
}

// ── Health HTTP API on :7922 ─────────────────────────────────────────────────

function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agentId: AGENT_ID }));
      return;
    }

    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agentId: AGENT_ID,
        nodeType: CONFIG.nodeType,
        natsConnected: isConnected(),
        uptimeSec: Math.floor((Date.now() - START_TIME) / 1_000),
        ghostbrainUrl: CONFIG.ghostbrainUrl,
        ts: new Date().toISOString(),
      }));
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(CONFIG.healthPort, () => {
    console.info(`[agent] health API listening on :${CONFIG.healthPort}`);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.info(`[agent] GhostBrain Swarm Agent starting — id=${AGENT_ID} node=${CONFIG.nodeType}`);

  // Connect to NATS (non-blocking — falls back to queue if unavailable)
  await initBus();

  // Health HTTP API
  startHealthServer();

  // Periodic detection tasks (detect-only — no autonomous remediation)
  scheduleRepeating(runValidatorTask, CONFIG.validatorIntervalMs, 'validatorTask');
  scheduleRepeating(runNetworkTask, CONFIG.networkIntervalMs, 'networkTask');
  scheduleRepeating(runSecurityTask, CONFIG.securityIntervalMs, 'securityTask');

  // Heartbeat
  setInterval(publishHeartbeat, CONFIG.heartbeatIntervalMs);
  publishHeartbeat();

  console.info('[agent] all tasks scheduled');
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
