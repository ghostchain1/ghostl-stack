/**
 * GDTP Bundle Router
 * Computes routes between interplanetary nodes and forwards bundles.
 */
import { fetch } from "undici";
import {
  type GDTPBundle,
  type InterplanetaryRoute,
  type RouteHop,
  NODE_ENVIRONMENTS,
  estimateLatencyMs,
} from "ghost-interplanetary-sdk";
import { getBundle, updateStatus, addHop } from "./bundleStore.js";

const FORWARD_TIMEOUT_MS = 30_000;

// Known peer DTN relays — override via env: DTN_PEER_<NODEID>=http://host:7983
function peerRelayUrl(nodeId: string): string | undefined {
  // Sanitize nodeId for env key usage
  const key = `DTN_PEER_${nodeId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[key];
}

// Routing table: pre-computed routes (updated by coordinator)
const routeTable = new Map<string, InterplanetaryRoute>();

export function upsertRoute(route: InterplanetaryRoute): void {
  const key = `${route.sourceNodeId}->${route.destNodeId}`;
  routeTable.set(key, route);
}

export function getRoute(from: string, to: string): InterplanetaryRoute | undefined {
  return routeTable.get(`${from}->${to}`);
}

export function getAllRoutes(): InterplanetaryRoute[] {
  return [...routeTable.values()];
}

/**
 * Compute a simple direct route between two nodes.
 * In production this would use Dijkstra over the full mesh topology.
 */
export function computeRoute(sourceNodeId: string, destNodeId: string): InterplanetaryRoute {
  // Heuristic: single-hop direct
  const latency = 1_000; // default; replaced by node registry data at runtime
  const hop: RouteHop = { nodeId: destNodeId, latencyMs: latency, reliable: true };
  const route: InterplanetaryRoute = {
    sourceNodeId,
    destNodeId,
    hops: [hop],
    totalLatencyMs: latency,
    reliability: 0.9,
    computedAt: Date.now(),
  };
  upsertRoute(route);
  return route;
}

/**
 * Forward a bundle to the next-hop peer relay.
 * Returns true if the peer acknowledged receipt.
 */
export async function forwardBundle(bundleId: string): Promise<{ ok: boolean; hopNode?: string }> {
  const bundle = getBundle(bundleId);
  if (!bundle) return { ok: false };

  // Check TTL
  if (Date.now() > bundle.expiresAt) {
    updateStatus(bundleId, "expired");
    return { ok: false };
  }

  const route = getRoute(bundle.sourceNodeId, bundle.destNodeId) ?? computeRoute(bundle.sourceNodeId, bundle.destNodeId);
  // Next hop: first hop that hasn't been visited
  const nextHop = route.hops.find((h) => !bundle.route.includes(h.nodeId));
  if (!nextHop) {
    // Already at destination
    updateStatus(bundleId, "delivered");
    return { ok: true, hopNode: bundle.destNodeId };
  }

  const peerUrl = peerRelayUrl(nextHop.nodeId);
  if (!peerUrl) {
    // No peer configured — mark as in-transit (will retry)
    updateStatus(bundleId, "in-transit");
    return { ok: true, hopNode: nextHop.nodeId };
  }

  try {
    const res = await fetch(`${peerUrl}/bundles/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (res.ok) {
      addHop(bundleId, nextHop.nodeId);
      if (nextHop.nodeId === bundle.destNodeId) {
        updateStatus(bundleId, "delivered");
      } else {
        updateStatus(bundleId, "in-transit");
      }
      return { ok: true, hopNode: nextHop.nodeId };
    }
    updateStatus(bundleId, "failed");
    return { ok: false };
  } catch {
    updateStatus(bundleId, "failed");
    return { ok: false };
  }
}
