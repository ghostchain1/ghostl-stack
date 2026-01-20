import crypto from 'crypto';
import type { LokiLogEntry } from '../../clients/loki';
import type { LogEvent, LogLayer, LogSeverity, NormalizedLogEvent } from '@ghostl/types/observability';

export interface FlattenedLokiEvent {
  log: LogEvent;
  timestampNs: string;
}

const SECRET_KEYS = ['secret', 'token', 'password', 'private', 'mnemonic', 'seed', 'api_key', 'apikey', 'key'];
const LEVEL_MAP: Record<string, LogSeverity> = {
  debug: 'INFO',
  info: 'INFO',
  warn: 'WARN',
  warning: 'WARN',
  error: 'ERROR',
  critical: 'CRITICAL'
};

const chainByLayer: Record<LogLayer, string> = {
  L1: 'GhostChain',
  L2: 'GhostL2',
  L3: 'GhostL3',
  INFRA: 'Infrastructure',
  UNKNOWN: 'Unknown'
};

const isSecretKey = (key: string) => {
  const lowered = key.toLowerCase();
  return SECRET_KEYS.some((candidate) => lowered.includes(candidate));
};

const redactValue = (value: string) => {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const sanitizeLabels = (labels?: Record<string, string>) => {
  if (!labels) return undefined;
  const sanitized: Record<string, string> = {};
  Object.entries(labels).forEach(([key, value]) => {
    if (isSecretKey(key)) {
      sanitized[key] = redactValue(value);
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
};

const sanitizeDetails = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeDetails(entry));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, val]) => {
      if (isSecretKey(key) && typeof val === 'string') {
        next[key] = redactValue(val);
        return;
      }
      next[key] = sanitizeDetails(val);
    });
    return next;
  }
  if (typeof value === 'string') {
    return value.replace(
      /(token|secret|password|private|mnemonic|seed)\s*[:=]\s*([A-Za-z0-9-_/.]+)/gi,
      (_match, label, token) => `${label}=***`
    );
  }
  return value;
};

const safeJsonParse = (input: string): Record<string, unknown> | null => {
  if (!input || input.length < 2) return null;
  if (input[0] !== '{' && input[0] !== '[') return null;
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const resolveLayer = (labels?: Record<string, string>, component?: string, message?: string): LogLayer => {
  const labelHint = `${labels?.layer || ''} ${labels?.network || ''}`.toLowerCase();
  const componentHint = (component || '').toLowerCase();
  const messageHint = (message || '').toLowerCase();
  if (labelHint.includes('l3') || componentHint.includes('l3') || messageHint.includes('l3')) return 'L3';
  if (labelHint.includes('l2') || componentHint.includes('l2') || componentHint.includes('op-')) return 'L2';
  if (labelHint.includes('l1') || componentHint.includes('l1') || componentHint.includes('ghostchain')) return 'L1';
  if (labelHint.includes('infra') || componentHint.includes('observability')) return 'INFRA';
  if (
    componentHint.includes('grafana') ||
    componentHint.includes('prometheus') ||
    componentHint.includes('loki') ||
    componentHint.includes('vault') ||
    componentHint.includes('vector') ||
    componentHint.includes('fluent') ||
    messageHint.includes('vault')
  ) {
    return 'INFRA';
  }
  return 'UNKNOWN';
};

const resolveComponent = (labels?: Record<string, string>, details?: Record<string, unknown>, fallback?: string) => {
  const detailComponent = typeof details?.component === 'string' ? details.component : undefined;
  const detailService = typeof details?.service === 'string' ? details.service : undefined;
  return (
    detailComponent ||
    detailService ||
    labels?.component ||
    labels?.job ||
    labels?.app ||
    fallback ||
    'unknown'
  );
};

const resolveSeverity = (level?: string, message?: string, details?: Record<string, unknown>): LogSeverity => {
  const detailSeverity = typeof details?.severity === 'string' ? details.severity.toLowerCase() : undefined;
  const baseLevel = (detailSeverity || level || 'info').toLowerCase();
  const base = LEVEL_MAP[baseLevel] || 'INFO';
  const msg = `${message || ''} ${details?.event || ''} ${details?.type || ''}`.toLowerCase();
  if (msg.includes('slashing') || msg.includes('double-sign') || msg.includes('slash')) return 'SLASHING_RISK';
  if (msg.includes('consensus') || msg.includes('finality') || msg.includes('reorg')) return 'CONSENSUS_RISK';
  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('invalid signature') || msg.includes('security')) {
    return 'SECURITY_EVENT';
  }
  if (msg.includes('critical') || msg.includes('panic') || msg.includes('fatal')) return 'CRITICAL';
  if (msg.includes('ai_decision') || msg.includes('ai decision')) return 'AI_DECISION';
  return base;
};

const slugifyEvent = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'log_event';

const resolveEvent = (message: string, details?: Record<string, unknown>) => {
  const detailEvent = typeof details?.event === 'string' ? details.event : undefined;
  const detailAction = typeof details?.action === 'string' ? details.action : undefined;
  const detailType = typeof details?.type === 'string' ? details.type : undefined;
  const source = detailEvent || detailAction || detailType || message;
  return slugifyEvent(source || 'log_event');
};

const extractMatch = (message: string, pattern: RegExp) => {
  const match = message.match(pattern);
  return match?.[1];
};

const extractFields = (message: string, labels?: Record<string, string>, details?: Record<string, unknown>) => {
  const requestId =
    (details?.request_id as string) ||
    (details?.requestId as string) ||
    labels?.request_id ||
    extractMatch(message, /request[_-]?id[:= ]([a-zA-Z0-9-]+)/i);
  const traceId =
    (details?.trace_id as string) ||
    (details?.traceId as string) ||
    labels?.trace_id ||
    extractMatch(message, /trace[_-]?id[:= ]([a-zA-Z0-9-]+)/i);
  const txHash =
    (details?.tx_hash as string) ||
    (details?.txHash as string) ||
    labels?.tx_hash ||
    extractMatch(message, /(0x[a-fA-F0-9]{64})/);
  const blockNumberRaw =
    (details?.block_number as string | number | undefined) ||
    (details?.blockNumber as string | number | undefined) ||
    labels?.block_number ||
    extractMatch(message, /block(?:_number)?[:= ](\d+)/i);
  const blockNumber = blockNumberRaw !== undefined ? Number(blockNumberRaw) : undefined;
  const nodeId =
    (details?.node_id as string) ||
    (details?.nodeId as string) ||
    labels?.node_id ||
    labels?.instance ||
    extractMatch(message, /node[_-]?id[:= ]([a-zA-Z0-9-]+)/i);
  return { requestId, traceId, txHash, blockNumber: Number.isFinite(blockNumber) ? blockNumber : undefined, nodeId };
};

export const flattenLokiEntries = (entries: LokiLogEntry[]): FlattenedLokiEvent[] => {
  const events: FlattenedLokiEvent[] = [];
  entries.forEach((entry) => {
    entry.values.forEach(([timestampNs, message]) => {
      events.push({
        timestampNs,
        log: {
          source: entry.stream.job || entry.stream.instance || 'loki',
          level: (entry.stream.level as LogEvent['level']) || 'info',
          message,
          time: new Date(parseInt(timestampNs, 10) / 1_000_000).toISOString(),
          labels: entry.stream
        }
      });
    });
  });
  return events;
};

export const normalizeLogEvent = (event: LogEvent, timestampNs?: string): NormalizedLogEvent => {
  const parsed = safeJsonParse(event.message);
  const details = parsed ? (sanitizeDetails(parsed) as Record<string, unknown>) : undefined;
  const message =
    (typeof details?.msg === 'string' && details.msg) ||
    (typeof details?.message === 'string' && details.message) ||
    event.message;
  const sanitizedMessage = (sanitizeDetails(message) as string) || message;
  const labels = sanitizeLabels(event.labels);
  const component = resolveComponent(labels, details, event.source);
  const layer = resolveLayer(labels, component, message);
  const chain = (typeof details?.chain === 'string' && details.chain) || labels?.chain || chainByLayer[layer];
  const severity = resolveSeverity(event.level, sanitizedMessage, details);
  const eventName = resolveEvent(sanitizedMessage, details);
  const extracted = extractFields(sanitizedMessage, labels, details);
  const id = crypto
    .createHash('sha256')
    .update(`${timestampNs || event.time}-${component}-${eventName}-${sanitizedMessage}`)
    .digest('hex')
    .slice(0, 24);
  return {
    id,
    timestamp: event.time,
    timestampNs,
    layer,
    chain,
    component,
    severity,
    event: eventName,
    message: sanitizedMessage,
    requestId: extracted.requestId,
    traceId: extracted.traceId,
    blockNumber: extracted.blockNumber,
    txHash: extracted.txHash,
    nodeId: extracted.nodeId,
    labels,
    details,
    source: event.source
  };
};

export const normalizeLogEvents = (events: FlattenedLokiEvent[]): NormalizedLogEvent[] => {
  return events.map((entry) => normalizeLogEvent(entry.log, entry.timestampNs));
};

export const isCriticalSeverity = (severity: LogSeverity) =>
  severity === 'CRITICAL' || severity === 'SLASHING_RISK' || severity === 'SECURITY_EVENT';
