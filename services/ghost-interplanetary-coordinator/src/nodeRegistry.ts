/**
 * Interplanetary Node Registry
 * Tracks Earth, Orbital, Lunar, and Deep-Space nodes.
 */
import { fetch } from "undici";
import {
  type InterplanetaryNode,
  type NodeEnvironment,
  NODE_ENVIRONMENTS,
} from "ghost-interplanetary-sdk";

const registry = new Map<string, InterplanetaryNode>();
const PROBE_TIMEOUT_MS = 10_000;

export function registerNode(
  input: Omit<InterplanetaryNode, "online" | "lastContact">
): InterplanetaryNode {
  const node: InterplanetaryNode = {
    ...input,
    online: true,
    lastContact: Date.now(),
  };
  registry.set(node.id, node);
  return node;
}

export function removeNode(id: string): boolean {
  if (!registry.has(id)) return false;
  registry.delete(id);
  return true;
}

export function getNode(id: string): InterplanetaryNode | undefined {
  return registry.get(id);
}

export function getAllNodes(): InterplanetaryNode[] {
  return [...registry.values()];
}

export function getByEnvironment(env: NodeEnvironment): InterplanetaryNode[] {
  return [...registry.values()].filter((n) => n.environment === env);
}

export function getOnline(): InterplanetaryNode[] {
  return [...registry.values()].filter((n) => n.online);
}

export function envSummary(): Record<NodeEnvironment, { total: number; online: number }> {
  const result = {} as Record<NodeEnvironment, { total: number; online: number }>;
  for (const env of NODE_ENVIRONMENTS) {
    const nodes = getByEnvironment(env);
    result[env] = { total: nodes.length, online: nodes.filter((n) => n.online).length };
  }
  return result;
}

/**
 * Probe a single node's HTTP health endpoint.
 * Earth/orbital nodes expose an HTTP port; space nodes are reachable via relay.
 */
async function probeNode(node: InterplanetaryNode): Promise<boolean> {
  if (node.environment === "deep-space") {
    // Deep-space nodes are considered online if last contact < 7 days
    return Date.now() - node.lastContact < 7 * 86_400_000;
  }
  try {
    const res = await fetch(`http://${node.host}/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let probeTimer: NodeJS.Timeout | null = null;

export function startProbing(intervalMs = 60_000): void {
  if (probeTimer) return;
  probeTimer = setInterval(async () => {
    await Promise.allSettled(
      [...registry.values()].map(async (node) => {
        const online = await probeNode(node);
        node.online = online;
        if (online) node.lastContact = Date.now();
        registry.set(node.id, node);
      })
    );
  }, intervalMs);
}

export function stopProbing(): void {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}
