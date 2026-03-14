/**
 * Node Manager
 *
 * Monitors blockchain node sync status from SystemState and proposes
 * restart actions when sync lag exceeds the policy threshold.
 *
 * Node restarts are out-of-scope for direct exec (restarting a blockchain
 * node carries significant risk of data corruption if done improperly).
 * All node restart actions require human ratification (autoExecute=false).
 */
import type { SystemState, InfraAction, NodeInfo } from "../types.js";
import { NODE_SYNC_LAG_THRESHOLD } from "../policies/security-policy.js";

function classifyNodeRisk(node: NodeInfo): "high" | "critical" {
  return node.syncLag > NODE_SYNC_LAG_THRESHOLD * 10 ? "critical" : "high";
}

export async function manageNodes(state: SystemState): Promise<InfraAction[]> {
  const actions: InfraAction[] = [];
  const now = Date.now();

  for (const node of state.nodes) {
    // Unreachable node — highest priority alert
    if (!node.reachable) {
      actions.push({
        id:          crypto.randomUUID(),
        type:        "node_restart",
        target:      node.name,
        description: `Node "${node.name}" (chainId ${node.chainId}, ${node.rpc}) is unreachable. Requires immediate investigation and manual restart.`,
        params: {
          nodeName:  node.name,
          rpc:       node.rpc,
          chainId:   node.chainId,
          reachable: false,
        },
        timestamp:   now,
        risk:        "critical",
        autoExecute: false,  // node restart always requires human ratification
      });
      continue;
    }

    // Sync lag exceeded threshold
    if (node.syncLag > NODE_SYNC_LAG_THRESHOLD) {
      actions.push({
        id:          crypto.randomUUID(),
        type:        "node_restart",
        target:      node.name,
        description: `Node "${node.name}" sync lag ${node.syncLag} blocks exceeds threshold ${NODE_SYNC_LAG_THRESHOLD}. Current block: ${node.blockNumber}. Peers: ${node.peerCount}. Review node logs and consider restart.`,
        params: {
          nodeName:  node.name,
          rpc:       node.rpc,
          chainId:   node.chainId,
          syncLag:   node.syncLag,
          threshold: NODE_SYNC_LAG_THRESHOLD,
          blockNumber: node.blockNumber.toString(),
          peerCount: node.peerCount,
        },
        timestamp:   now,
        risk:        classifyNodeRisk(node),
        autoExecute: false,  // node restart always requires human ratification
      });
    }

    // Zero peers — isolated node warning
    if (node.reachable && node.peerCount === 0 && node.blockNumber > 0n) {
      actions.push({
        id:          crypto.randomUUID(),
        type:        "node_restart",
        target:      node.name,
        description: `Node "${node.name}" has zero peers. Network isolation possible. Check P2P port and bootnodes.`,
        params: {
          nodeName:   node.name,
          rpc:        node.rpc,
          chainId:    node.chainId,
          peerCount:  node.peerCount,
          blockNumber: node.blockNumber.toString(),
        },
        timestamp:   now,
        risk:        "medium",
        autoExecute: false,
      });
    }
  }

  return actions;
}
