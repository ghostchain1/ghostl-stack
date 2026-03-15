/**
 * Streaming Scaler — GhostBrain Infrastructure AI
 *
 * Manages streaming node capacity to ensure zero-lag delivery
 * for millions of concurrent viewers.
 *
 * Scale-UP triggers (any one suffices):
 *   • Active streams / streaming node  > STREAMS_PER_NODE_LIMIT
 *   • Average viewers per node          > VIEWERS_PER_NODE_LIMIT
 *   • Average streaming CPU             > CPU_SCALE_UP_PCT
 *   • Total active streams              > GLOBAL_STREAM_SCALE_THRESHOLD
 *
 * Scale-DOWN triggers (ALL must be true):
 *   • Active streams / node             < STREAMS_PER_NODE_LIMIT * 0.3
 *   • Average CPU across streaming nodes < CPU_SCALE_DOWN_PCT
 *   • Node count                        > MIN_NODES['streaming_node']
 */

import {
  addNode, drainAndRemoveNode, listNodes,
  hotestRegion, idlestNode, getClusterSnapshot,
  type Region,
} from './cluster_manager.js';
import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Thresholds ─────────────────────────────────────────────────────────────────

const STREAMS_PER_NODE_LIMIT       = 50;   // scale up above this ratio
const VIEWERS_PER_NODE_LIMIT       = 5_000;
const GLOBAL_STREAM_SCALE_THRESHOLD = 500;  // absolute active stream count triggers scale
const CPU_SCALE_UP_PCT             = 70;
const CPU_SCALE_DOWN_PCT           = 20;
const SCALE_DOWN_RATENCY           = 0.3;   // must be below 30% of limit to scale down

// ── Evaluation ─────────────────────────────────────────────────────────────────

export interface StreamingCapacityReport {
  streamingNodes:       number;
  totalActiveStreams:   number;
  totalViewers:         number;
  streamsPerNode:       number;
  viewersPerNode:       number;
  averageCpuPct:        number;
  recommendation:       'scale_up' | 'scale_down' | 'ok';
  recommendedTargetRegion?: Region;
  reason:               string;
}

export function evaluateStreamingCapacity(): StreamingCapacityReport {
  const nodes   = listNodes({ type: 'streaming_node', status: 'healthy' });
  const n       = nodes.length || 1;

  const totalStreams  = nodes.reduce((s, x) => s + x.activeStreams, 0);
  const snapshot      = getClusterSnapshot();
  const totalViewers  = snapshot.streamingCapacity; // piggybacked from cluster snapshot

  const streamsPerNode = totalStreams / n;
  const viewersPerNode = totalViewers / n;
  const avgCpu         = nodes.reduce((s, x) => s + x.cpuPct, 0) / n;

  let recommendation: StreamingCapacityReport['recommendation'] = 'ok';
  let reason = 'capacity nominal';

  if (
    streamsPerNode > STREAMS_PER_NODE_LIMIT ||
    viewersPerNode > VIEWERS_PER_NODE_LIMIT ||
    avgCpu         > CPU_SCALE_UP_PCT       ||
    totalStreams    > GLOBAL_STREAM_SCALE_THRESHOLD
  ) {
    recommendation = 'scale_up';
    reason = [
      streamsPerNode > STREAMS_PER_NODE_LIMIT && `streams/node=${streamsPerNode.toFixed(0)} > ${STREAMS_PER_NODE_LIMIT}`,
      viewersPerNode > VIEWERS_PER_NODE_LIMIT && `viewers/node=${viewersPerNode.toFixed(0)} > ${VIEWERS_PER_NODE_LIMIT}`,
      avgCpu         > CPU_SCALE_UP_PCT       && `avgCPU=${avgCpu.toFixed(1)}% > ${CPU_SCALE_UP_PCT}%`,
      totalStreams    > GLOBAL_STREAM_SCALE_THRESHOLD && `totalStreams=${totalStreams} > ${GLOBAL_STREAM_SCALE_THRESHOLD}`,
    ].filter(Boolean).join('; ');
  } else if (
    streamsPerNode < STREAMS_PER_NODE_LIMIT * SCALE_DOWN_RATENCY &&
    avgCpu         < CPU_SCALE_DOWN_PCT &&
    nodes.length   > 2
  ) {
    recommendation = 'scale_down';
    reason         = `low utilisation: streams/node=${streamsPerNode.toFixed(0)}, cpu=${avgCpu.toFixed(1)}%`;
  }

  return {
    streamingNodes:      nodes.length,
    totalActiveStreams:  totalStreams,
    totalViewers,
    streamsPerNode:      parseFloat(streamsPerNode.toFixed(2)),
    viewersPerNode:      parseFloat(viewersPerNode.toFixed(0)),
    averageCpuPct:       parseFloat(avgCpu.toFixed(1)),
    recommendation,
    recommendedTargetRegion: recommendation === 'scale_up' ? hotestRegion('streaming_node') : undefined,
    reason,
  };
}

// ── Scale actions ──────────────────────────────────────────────────────────────

/** Deploy one additional streaming node into the highest-load region. */
export function deployStreamingNode(region?: Region): string {
  const targetRegion = region ?? hotestRegion('streaming_node');
  const node = addNode('streaming_node', targetRegion);
  _recordStreamingScaleEvent('scale_up', node.nodeId, targetRegion,
    `Auto-provisioned streaming node in ${targetRegion}`);
  return node.nodeId;
}

/** Drain and remove the lowest-utilization streaming node. */
export function removeIdleStreamingNode(): string | null {
  const idle = idlestNode('streaming_node');
  if (!idle) return null;
  drainAndRemoveNode(idle.nodeId, 'Low streaming utilisation — auto scale-down');
  _recordStreamingScaleEvent('scale_down', idle.nodeId, idle.region,
    `Drained idle streaming node in ${idle.region}`);
  return idle.nodeId;
}

// ── Surge detection ────────────────────────────────────────────────────────────

/**
 * Called when a single stream goes viral (sudden viewer spike).
 * Reserves capacity in the stream's home region immediately.
 */
export function handleViewerSurge(streamId: string, newViewerCount: number): void {
  const db  = getDb();
  const now = new Date().toISOString();

  // Log surge
  db.prepare(`
    INSERT INTO viewer_surge_events (event_id, stream_id, viewer_count, detected_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), streamId, newViewerCount, now);

  if (newViewerCount > 50_000) {
    // Viral stream: ensure 2 dedicated nodes
    deployStreamingNode();
    deployStreamingNode();
  } else if (newViewerCount > 10_000) {
    deployStreamingNode();
  }
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _recordStreamingScaleEvent(
  action: 'scale_up' | 'scale_down',
  nodeId: string,
  region: Region,
  reason: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO scaling_decisions
      (decision_id, node_type, action, node_id, region, reason, decided_at)
    VALUES (?, 'streaming_node', ?, ?, ?, ?, ?)
  `).run(uuidv4(), action, nodeId, region, reason, new Date().toISOString());
}
