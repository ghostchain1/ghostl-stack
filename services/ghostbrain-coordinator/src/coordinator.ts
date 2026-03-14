// GhostBrain Coordinator — subscribes to NATS swarm topics, aggregates alerts,
// forwards proposals to signing relay, exposes HTTP status API on :7923.
// Does not autonomously execute any remediation actions.
import http from 'http';
import type { NatsConnection, StringCodec as StringCodecType } from 'nats';
import type { SwarmMessage, AgentHeartbeat, SwarmProposal } from './swarmProtocol.js';
import { handleValidatorAlert } from './handlers/validatorHandler.js';
import { handleNetworkAlert } from './handlers/networkHandler.js';
import { handleSecurityAlert } from './handlers/securityHandler.js';

type NatsModule = typeof import('nats');

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const COORD_PORT = Number(process.env.GHOSTCOORD_PORT ?? 7923);
const START_TIME = Date.now();
const MAX_RECENT = 100;

// ── State ─────────────────────────────────────────────────────────────────────

interface AgentRecord {
  agentId: string;
  nodeType: string;
  status: string;
  uptimeSec: number;
  lastSeen: string;
}

const activeAgents = new Map<string, AgentRecord>();
const recentAlerts: SwarmMessage[] = [];
const recentProposals: SwarmProposal[] = [];
const alertCounts = { validator: 0, network: 0, security: 0 };

// ── NATS connection ───────────────────────────────────────────────────────────

async function loadNats(): Promise<NatsModule | null> {
  try { return await import('nats') as NatsModule; }
  catch { return null; }
}

async function startNatsSubscriptions(nc: NatsConnection, sc: ReturnType<StringCodecType>): Promise<void> {
  const topics = ['validator.alert', 'network.alert', 'security.alert', 'agent.heartbeat'] as const;

  for (const topic of topics) {
    const sub = nc.subscribe(topic);
    // Each subscription runs in an independent async loop
    void (async () => {
      for await (const m of sub) {
        try {
          const raw = sc.decode(m.data);
          const parsed = JSON.parse(raw) as SwarmMessage | AgentHeartbeat;

          if (topic === 'agent.heartbeat') {
            const hb = parsed as AgentHeartbeat;
            activeAgents.set(hb.agentId, {
              agentId: hb.agentId,
              nodeType: hb.nodeType,
              status: hb.status,
              uptimeSec: hb.uptimeSec,
              lastSeen: hb.ts,
            });
          } else {
            const msg = parsed as SwarmMessage;
            recentAlerts.unshift(msg);
            if (recentAlerts.length > MAX_RECENT) recentAlerts.pop();

            if (topic === 'validator.alert') {
              alertCounts.validator++;
              const proposal = await handleValidatorAlert(msg);
              recentProposals.unshift(proposal);
            } else if (topic === 'network.alert') {
              alertCounts.network++;
              const proposal = await handleNetworkAlert(msg);
              recentProposals.unshift(proposal);
            } else if (topic === 'security.alert') {
              alertCounts.security++;
              const proposal = await handleSecurityAlert(msg);
              recentProposals.unshift(proposal);
            }

            if (recentProposals.length > MAX_RECENT) recentProposals.pop();
          }
        } catch (err) {
          console.error(`[coordinator] parse error on ${topic}:`, err);
        }
      }
    })();
  }

  console.info('[coordinator] subscribed to all swarm topics');
}

// ── HTTP Status API on :7923 ──────────────────────────────────────────────────

function startStatusServer(natsConnected: () => boolean): void {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/status') {
      // Prune stale agents (no heartbeat in last 2 minutes)
      const cutoff = Date.now() - 2 * 60_000;
      for (const [id, rec] of activeAgents) {
        if (new Date(rec.lastSeen).getTime() < cutoff) activeAgents.delete(id);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        natsConnected: natsConnected(),
        activeAgents: Array.from(activeAgents.values()),
        alertCounts,
        recentAlerts: recentAlerts.slice(0, 20),
        recentProposals: recentProposals.slice(0, 20),
        uptimeSec: Math.floor((Date.now() - START_TIME) / 1_000),
        ts: new Date().toISOString(),
      }));
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(COORD_PORT, () => {
    console.info(`[coordinator] status API listening on :${COORD_PORT}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.info('[coordinator] GhostBrain Coordinator starting');

  let connected = false;

  startStatusServer(() => connected);

  const natsLib = await loadNats();
  if (!natsLib) {
    console.warn('[coordinator] nats package unavailable — running in offline mode');
    return;
  }

  let backoffMs = 2_000;
  while (true) {
    try {
      const { connect, StringCodec } = natsLib;
      const nc = await connect({ servers: NATS_URL, reconnect: true, maxReconnectAttempts: -1 });
      const sc = StringCodec();
      connected = true;
      backoffMs = 2_000;
      console.info(`[coordinator] connected to NATS at ${NATS_URL}`);

      await startNatsSubscriptions(nc, sc);
      await nc.closed();

      connected = false;
      console.warn('[coordinator] NATS connection closed — reconnecting');
    } catch (err) {
      connected = false;
      console.warn(`[coordinator] NATS error (retry in ${backoffMs}ms):`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 60_000);
  }
}

main().catch((err) => {
  console.error('[coordinator] fatal:', err);
  process.exit(1);
});
