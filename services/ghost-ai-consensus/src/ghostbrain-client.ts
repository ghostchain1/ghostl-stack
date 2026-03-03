/**
 * GhostBrain Core — embedded client (HTTP).
 * Self-contained; uses Node.js built-in fetch (≥18).
 *
 * Env vars:
 *   GHOSTBRAIN_URL      Base URL (default: http://ghostbrain-core:7900)
 *   GHOSTBRAIN_ENABLED  "false"/"0" to disable (default: true)
 */

const GHOSTBRAIN_URL = (process.env['GHOSTBRAIN_URL'] ?? 'http://ghostbrain-core:7900').replace(/\/$/, '');
const GHOSTBRAIN_ENABLED = process.env['GHOSTBRAIN_ENABLED'] !== 'false' && process.env['GHOSTBRAIN_ENABLED'] !== '0';

const AGENT_ID    = 'ghost-ai-consensus';
const AGENT_ROLE  = 'diagnostician';
const AGENT_LAYER = 'L2';

const REGISTER_BODY = {
  agentId:      AGENT_ID,
  role:         AGENT_ROLE,
  capabilities: ['policy.evaluate', 'metrics.query'],
  resourceScopes: [
    { type: 'stack', name: 'ghost-ai-consensus', layer: 'L2' },
    { type: 'stack', name: 'ghost-ai-consensus', layer: 'L3' },
  ],
  natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
  healthy: true,
};

function _log(level: 'info' | 'warn' | 'error', msg: string, extra?: object) {
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, service: AGENT_ID, msg, ...extra }));
}

export async function ghostbrainRegister(retries = 5): Promise<void> {
  if (!GHOSTBRAIN_ENABLED) return;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GHOSTBRAIN_URL}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(REGISTER_BODY),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        _log('info', 'Registered with GhostBrain Core', { role: AGENT_ROLE, url: GHOSTBRAIN_URL });
        return;
      }
      _log('warn', `GhostBrain registration HTTP ${res.status}`, { attempt, retries });
    } catch (err: unknown) {
      _log('warn', `GhostBrain registration error: ${err instanceof Error ? err.message : String(err)}`, { attempt, retries });
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 3_000));
  }
  _log('error', 'GhostBrain registration failed — running standalone');
}

export function ghostbrainStartHeartbeat(intervalMs = 30_000): void {
  if (!GHOSTBRAIN_ENABLED) return;
  const timer = setInterval(async () => {
    try {
      await fetch(`${GHOSTBRAIN_URL}/api/v1/signals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'manual', service: AGENT_ID, layer: AGENT_LAYER, anomaly: false, observedAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(3_000),
      });
    } catch { /* non-fatal */ }
  }, intervalMs);
  timer.unref();
  _log('info', 'GhostBrain heartbeat started', { intervalMs });
}
