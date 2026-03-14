/**
 * GhostBrain Memory — Pattern Memory
 *
 * Sliding-window pattern detection across all cluster nodes.
 * Detects correlated failure events: if a metric spike on Node A is
 * consistently followed by a crash on Node B within a time window,
 * GhostBrain can preemptively act on Node B when Node A spikes.
 */

const WINDOW_MS   = 5 * 60 * 1_000; // 5-minute correlation window
const MIN_COUNT   = 3;               // min occurrences to report a pattern

export interface RawNodeEvent {
  nodeId:    string;
  category:  string;
  label:     string;            // e.g. "cpu_overload", "container_crash"
  severity:  "info" | "warn" | "critical";
  timestamp: number;
}

export interface DetectedPattern {
  precursor:  { nodeId: string; label: string };
  consequence: { nodeId: string; label: string };
  count:      number;
  avgDelayMs: number;
  lastSeenAt: number;
  confidence: number; // 0–1
}

const _timeline: RawNodeEvent[] = [];
const MAX_TIMELINE = 10_000;

// Pattern co-occurrence table: "A→B" → { count, totalDelay }
const _cooc = new Map<string, { count: number; totalDelayMs: number; lastSeen: number }>();

function coocKey(a: RawNodeEvent, b: RawNodeEvent): string {
  return `${a.nodeId}:${a.label}|${b.nodeId}:${b.label}`;
}

export function recordNodeEvent(event: RawNodeEvent): void {
  const cutoff = event.timestamp - WINDOW_MS;

  // Look backwards in timeline for events that preceded this one
  for (let i = _timeline.length - 1; i >= 0; i--) {
    const prev = _timeline[i]!;
    if (prev.timestamp < cutoff) break;
    if (prev.nodeId === event.nodeId && prev.label === event.label) continue; // skip same event
    // prev → current correlation
    const key = coocKey(prev, event);
    const entry = _cooc.get(key) ?? { count: 0, totalDelayMs: 0, lastSeen: 0 };
    entry.count++;
    entry.totalDelayMs += event.timestamp - prev.timestamp;
    entry.lastSeen = event.timestamp;
    _cooc.set(key, entry);
  }

  _timeline.push(event);
  if (_timeline.length > MAX_TIMELINE) _timeline.shift();
}

export function detectPatterns(minConfidence = 0.4): DetectedPattern[] {
  const results: DetectedPattern[] = [];

  for (const [key, co] of _cooc) {
    if (co.count < MIN_COUNT) continue;
    const [precursorStr, consequenceStr] = key.split("|");
    if (!precursorStr || !consequenceStr) continue;

    const [pNode, pLabel] = precursorStr.split(":");
    const [cNode, cLabel] = consequenceStr.split(":");
    if (!pNode || !pLabel || !cNode || !cLabel) continue;

    const avgDelayMs = co.totalDelayMs / co.count;
    // Confidence: how reliably does precursor predict consequence?
    // Simple Jaccard-like: count vs total occurrences of precursor label on that node
    const precursorTotal = _timeline.filter(e => e.nodeId === pNode && e.label === pLabel).length;
    const confidence = precursorTotal > 0 ? co.count / precursorTotal : 0;

    if (confidence < minConfidence) continue;

    results.push({
      precursor:   { nodeId: pNode, label: pLabel },
      consequence: { nodeId: cNode, label: cLabel },
      count:       co.count,
      avgDelayMs,
      lastSeenAt:  co.lastSeen,
      confidence,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export function patternStats(): { timelineSize: number; coocPairs: number; patternsAboveThreshold: number } {
  const above = detectPatterns(0.4).length;
  return { timelineSize: _timeline.length, coocPairs: _cooc.size, patternsAboveThreshold: above };
}
