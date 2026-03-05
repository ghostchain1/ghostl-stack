// ghostbrain.ts — GhostBrain Core integration via NATS + HTTP
import { connect, StringCodec } from 'nats';
import type { NatsConnection } from 'nats';
import { randomUUID } from 'node:crypto';
import { CFG } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { handleSwapDirective } from './memory-swap-manager.js';
import type { HealthSignal } from './types.js';

const AGENT_ID = CFG.serviceName;
const AGENT_ROLE = 'executor';
const sc = StringCodec();
let _nc: NatsConnection | null = null;

const CAPABILITIES = [
  'vault.policy.enforce',
  'vault.secret.rotate',
  'vm.discover',
  'vm.start',
  'vm.stop',
  'vm.restart',
  'vm.snapshot',
  'docker.ps',
  'docker.restart',
  'docker.start',
  'docker.stop',
  'docker.inspect',
  'reconcile.run',
  'remediation.auto',
  'network.firewall.read',
];

function _envelope(subject: string, payload: unknown): string {
  return JSON.stringify({
    messageId: randomUUID(),
    subject,
    correlationId: randomUUID(),
    senderAgentId: AGENT_ID,
    payload,
    sentAt: new Date().toISOString(),
  });
}

function _publish(subject: string, payload: unknown): void {
  if (!_nc) return;
  try {
    _nc.publish(subject, sc.encode(_envelope(subject, payload)));
    metrics.natsPublished++;
  } catch (err) {
    metrics.natsErrors++;
    logger.warn('NATS publish failed', { subject, err: String(err) });
  }
}

export async function connectGhostBrain(): Promise<void> {
  if (!CFG.ghostbrainEnabled) {
    logger.info('GhostBrain disabled — standalone mode');
    return;
  }
  try {
    _nc = await connect({
      servers: CFG.natsUrl,
      reconnect: true,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 3_000,
      name: AGENT_ID,
    });
    logger.info('GhostBrain NATS connected', { url: CFG.natsUrl });

    // Register agent
    const now = new Date().toISOString();
    _publish('ghostbrain.agent.register', {
      agentId: AGENT_ID,
      role: AGENT_ROLE,
      capabilities: CAPABILITIES,
      resourceScopes: [
        { type: 'vm',     name: '*', layer: 'L1' },
        { type: 'vm',     name: '*', layer: 'L2' },
        { type: 'vm',     name: '*', layer: 'L3' },
        { type: 'stack',  name: '*', layer: 'L1' },
        { type: 'secret', name: '*', layer: 'L1' },
        { type: 'domain', name: 'vault', layer: 'L1' },
      ],
      natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
      registeredAt: now,
      lastSeen: now,
      healthy: true,
    });

    // Subscribe to inbound tasks
    const taskSub = _nc.subscribe(`ghostbrain.agent.${AGENT_ID}.task`);
    void (async () => {
      for await (const m of taskSub) {
        try {
          const msg = JSON.parse(sc.decode(m.data)) as { correlationId: string; payload: unknown };
          logger.info('GhostBrain task received', { payload: msg.payload });
          _publish(`ghostbrain.agent.${AGENT_ID}.report`, {
            correlationId: msg.correlationId,
            result: { status: 'acknowledged', receivedAt: new Date().toISOString() },
            reportedAt: new Date().toISOString(),
          });
        } catch (err) {
          logger.error('GhostBrain task parse error', { err: String(err) });
        }
      }
    })();

    // Subscribe to memory swap directives from GhostBrain Core
    const swapSub = _nc.subscribe('hypervisor.memory.swap.directive');
    void (async () => {
      for await (const m of swapSub) {
        try {
          const envelope = JSON.parse(sc.decode(m.data)) as { payload: Parameters<typeof handleSwapDirective>[0] };
          const directive = envelope.payload;
          logger.info('MemorySwap directive received', {
            directiveId: directive.directiveId,
            workloadId: directive.workloadId,
            action: directive.action,
          });
          const outcome = await handleSwapDirective(directive);
          _publish('hypervisor.memory.swap.executed', outcome);
        } catch (err) {
          logger.error('MemorySwap directive parse/execute error', { err: String(err) });
        }
      }
    })();

    // Heartbeat every 30 s
    setInterval(() => {
      publishHealthSignal({
        signalId: randomUUID(),
        source: 'heartbeat',
        service: AGENT_ID,
        layer: 'L1',
        metric: 'agent.alive',
        value: 1,
        observedAt: new Date().toISOString(),
        anomaly: false,
      });
    }, 30_000).unref();
  } catch (err) {
    logger.warn('GhostBrain NATS unavailable — standalone mode', { err: String(err) });
  }
}

export function publishHealthSignal(signal: HealthSignal): void {
  _publish('ghostbrain.signal.health', signal);
}

export function publishMemoryPressureSignal(signal: unknown): void {
  _publish('hypervisor.memory.pressure', signal);
  metrics.memoryPressurePublished = (metrics.memoryPressurePublished ?? 0) + 1;
}

export function publishAnomalySignal(metric: string, value: number, threshold: number): void {
  metrics.anomalies++;
  _publish('ghostbrain.signal.health', {
    signalId: randomUUID(),
    source: 'manual',
    service: AGENT_ID,
    layer: 'L1',
    metric,
    value,
    threshold,
    observedAt: new Date().toISOString(),
    anomaly: true,
  });
  // Also send to GhostBrain HTTP (fire-and-forget)
  if (CFG.ghostbrainEnabled) {
    fetch(`${CFG.ghostbrainUrl}/api/v1/signals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual', service: AGENT_ID, layer: 'L1',
        anomaly: true, metric, value, threshold,
        observedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3_000),
    }).catch(() => { /* fire-and-forget */ });
  }
}

export async function registerWithGhostBrainHttp(retries = 5): Promise<void> {
  if (!CFG.ghostbrainEnabled) return;
  const body = JSON.stringify({
    agentId: AGENT_ID,
    role: AGENT_ROLE,
    capabilities: CAPABILITIES,
    resourceScopes: [
      { type: 'stack',  name: CFG.serviceName, layer: 'L1' },
      { type: 'domain', name: 'vault', layer: 'L1' },
    ],
    natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
    healthy: true,
  });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${CFG.ghostbrainUrl}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        logger.info('Registered with GhostBrain Core (HTTP)', { url: CFG.ghostbrainUrl });
        return;
      }
      logger.warn('GhostBrain HTTP registration non-200', { attempt, status: res.status });
    } catch (err) {
      logger.warn('GhostBrain HTTP registration error', { attempt, err: String(err) });
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 3_000));
  }
  logger.error('GhostBrain HTTP registration failed — running standalone');
}

export async function drainNats(): Promise<void> {
  if (_nc) {
    try { await _nc.drain(); } catch { /* ignore */ }
  }
}
