// securityTask — reads real anomaly signals from GhostBrain anomaly API
// Never uses Math.random(); alerts are driven by real anomaly events.
import { publish } from '../communication/swarmBus.js';
import type { SwarmMessage, AlertSeverity } from '../communication/swarmProtocol.js';
import { CONFIG, AGENT_ID } from '../config/agentConfig.js';

interface AnomalyEvent {
  id: string;
  severity: string;
  type: string;
  description: string;
  score?: number;
  ts?: string;
}

interface AnomalyPayload {
  events?: AnomalyEvent[];
  riskScore?: number;
  status?: string;
}

async function fetchAnomalyEvents(): Promise<AnomalyPayload> {
  const resp = await fetch(
    `${CONFIG.ghostbrainUrl}/anomaly/events?agent=${encodeURIComponent(AGENT_ID)}&limit=20`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!resp.ok) throw new Error(`anomaly/events ${resp.status}`);
  return resp.json() as Promise<AnomalyPayload>;
}

function mapSeverity(raw: string | undefined): AlertSeverity {
  if (raw === 'critical' || raw === 'high') return 'critical';
  if (raw === 'medium' || raw === 'warning') return 'warning';
  return 'info';
}

export async function runSecurityTask(): Promise<void> {
  let payload: AnomalyPayload;
  try {
    payload = await fetchAnomalyEvents();
  } catch (err) {
    console.warn('[securityTask] fetch failed:', (err as Error).message);
    return;
  }

  const now = new Date().toISOString();
  const events = payload.events ?? [];

  for (const event of events) {
    const severity = mapSeverity(event.severity);

    // Only alert on warning/critical to reduce noise
    if (severity === 'info') continue;

    const msg: SwarmMessage = {
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'security.alert',
      severity,
      type: event.type ?? 'anomaly_detected',
      value: event.score,
      detail: event.description ?? `GhostBrain anomaly: ${event.type}`,
      payload: {
        eventId: event.id,
        riskScore: payload.riskScore ?? event.score ?? null,
        anomalyType: event.type,
        originalSeverity: event.severity,
      },
      ts: event.ts ?? now,
    };

    publish('security.alert', msg);
    console.info(`[securityTask] published anomaly ${event.type} (${severity})`);
  }

  // If overall risk score is high, publish a summary alert even if no discrete events
  if (!events.length && payload.riskScore !== undefined && payload.riskScore >= 0.8) {
    const msg: SwarmMessage = {
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'security.alert',
      severity: 'warning',
      type: 'elevated_risk_score',
      value: payload.riskScore,
      detail: `GhostBrain reports elevated risk score: ${payload.riskScore.toFixed(3)}`,
      payload: { riskScore: payload.riskScore },
      ts: now,
    };
    publish('security.alert', msg);
    console.info(`[securityTask] published elevated_risk_score (warning)`);
  }
}
