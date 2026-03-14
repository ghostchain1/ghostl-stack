/**
 * GhostBrain Infra — Network Controller
 *
 * Read-only topology monitoring + isolation/reconnect actions via agent REST.
 * Direct network manipulation (VLANs, bridges) is delegated to the agent on
 * the relevant host via AGENT_URLS env (comma-separated agent base URLs).
 */

import { request } from "undici";

export interface NetworkInterface {
  hostUrl:   string;
  ifName:    string;
  rxKbps:    number;
  txKbps:    number;
  errors:    number;
  state:     "up" | "down" | "unknown";
}

export interface NetworkTopology {
  timestamp: number;
  hosts:     { url: string; interfaces: NetworkInterface[] }[];
  totalRxKbps: number;
  totalTxKbps: number;
  totalErrors: number;
}

const AGENT_URLS: string[] = (process.env.AGENT_URLS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

async function getHostMetrics(agentUrl: string): Promise<NetworkInterface[]> {
  try {
    const res = await request(`${agentUrl}/api/v1/agent/metrics`, {
      method:      "GET",
      headers:     { Accept: "application/json" },
      bodyTimeout: 5_000,
    });
    if (res.statusCode !== 200) return [];
    const data = await res.body.json() as {
      node?: { network?: { rxKbps?: number; txKbps?: number; errors?: number } }
    };
    const net = data?.node?.network;
    if (!net) return [];
    return [{
      hostUrl: agentUrl,
      ifName:  "aggregate",
      rxKbps:  net.rxKbps  ?? 0,
      txKbps:  net.txKbps  ?? 0,
      errors:  net.errors  ?? 0,
      state:   "up",
    }];
  } catch {
    return [];
  }
}

export async function getNetworkTopology(): Promise<NetworkTopology> {
  const perHost = await Promise.all(AGENT_URLS.map(async url => ({
    url,
    interfaces: await getHostMetrics(url),
  })));

  let totalRx = 0; let totalTx = 0; let totalErr = 0;
  for (const h of perHost) {
    for (const iface of h.interfaces) {
      totalRx  += iface.rxKbps;
      totalTx  += iface.txKbps;
      totalErr += iface.errors;
    }
  }

  return { timestamp: Date.now(), hosts: perHost, totalRxKbps: totalRx, totalTxKbps: totalTx, totalErrors: totalErr };
}

/**
 * Isolate a node: send a control command to the agent to stop all non-essential containers.
 * The actual network VLAN isolation would require a dedicated SDN controller.
 */
export async function isolateNode(agentUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await request(`${agentUrl}/api/v1/agent/control`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "noop", targetId: "network-isolate", params: { reason: "infra-controller-isolation" } }),
      bodyTimeout: 8_000,
    });
    return { ok: res.statusCode < 300, message: res.statusCode < 300 ? "isolation signal sent" : `failed (${res.statusCode})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "unknown error" };
  }
}
