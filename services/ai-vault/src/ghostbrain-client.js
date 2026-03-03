/**
 * GhostBrain Core — embedded client (HTTP, ESM JS).
 * Self-contained; uses Node.js built-in fetch (≥18).
 *
 * Env vars:
 *   GHOSTBRAIN_URL      Base URL (default: http://ghostbrain-core:7900)
 *   GHOSTBRAIN_ENABLED  "false"/"0" to disable (default: true)
 */

const GHOSTBRAIN_URL = (process.env.GHOSTBRAIN_URL ?? 'http://ghostbrain-core:7900').replace(/\/$/, '');
const GHOSTBRAIN_ENABLED = process.env.GHOSTBRAIN_ENABLED !== 'false' && process.env.GHOSTBRAIN_ENABLED !== '0';

const AGENT_ID    = 'ai-vault';
const AGENT_ROLE  = 'auditor';
const AGENT_LAYER = 'L1';

const REGISTER_BODY = JSON.stringify({
  agentId:      AGENT_ID,
  role:         AGENT_ROLE,
  capabilities: ['vault.health', 'policy.evaluate'],
  resourceScopes: [
    { type: 'stack',  name: 'ai-vault', layer: 'L1' },
    { type: 'domain', name: 'vault',    layer: 'L1' },
  ],
  natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
  healthy: true,
});

const HEADERS = { 'content-type': 'application/json' };

function _log(level, msg, extra = {}) {
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, service: AGENT_ID, msg, ...extra }));
}

export async function ghostbrainRegister(retries = 5) {
  if (!GHOSTBRAIN_ENABLED) return;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GHOSTBRAIN_URL}/api/v1/agents/register`, {
        method: 'POST', headers: HEADERS, body: REGISTER_BODY,
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) { _log('info', 'Registered with GhostBrain Core', { role: AGENT_ROLE, url: GHOSTBRAIN_URL }); return; }
      _log('warn', `GhostBrain registration HTTP ${res.status}`, { attempt, retries });
    } catch (err) {
      _log('warn', `GhostBrain registration error: ${err?.message ?? err}`, { attempt, retries });
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 3_000));
  }
  _log('error', 'GhostBrain registration failed — running standalone');
}

/** Send an anomaly signal to GhostBrain when vault anomalies are detected. */
export async function ghostbrainAnomalySignal(metric, value, threshold) {
  if (!GHOSTBRAIN_ENABLED) return;
  try {
    await fetch(`${GHOSTBRAIN_URL}/api/v1/signals`, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ source: 'manual', service: AGENT_ID, layer: AGENT_LAYER, anomaly: true, metric, value, threshold, observedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* non-fatal */ }
}

export function ghostbrainStartHeartbeat(intervalMs = 30_000) {
  if (!GHOSTBRAIN_ENABLED) return;
  const timer = setInterval(async () => {
    try {
      await fetch(`${GHOSTBRAIN_URL}/api/v1/signals`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ source: 'manual', service: AGENT_ID, layer: AGENT_LAYER, anomaly: false, observedAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(3_000),
      });
    } catch { /* non-fatal */ }
  }, intervalMs);
  timer.unref();
  _log('info', 'GhostBrain heartbeat started', { intervalMs });
}
