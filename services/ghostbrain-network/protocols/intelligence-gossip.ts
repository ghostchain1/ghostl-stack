/**
 * Intelligence Gossip Protocol — fast peer-to-peer information propagation.
 */
import { NetworkNode, NodeMessage } from "../src/NetworkNode";

export function gossip(message: NodeMessage, peers: NetworkNode[]): void {
  for (const peer of peers) {
    peer.receive(message);
  }
}

export function fanoutGossip(
  message: NodeMessage,
  allNodes: NetworkNode[],
  fanout = 3
): NetworkNode[] {
  // Randomly select 'fanout' peers to propagate
  const shuffled = [...allNodes].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, fanout);
  gossip(message, selected);
  return selected;
}
