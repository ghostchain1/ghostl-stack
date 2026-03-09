/**
 * Network Analyzer (Infra)
 *
 * Measures TCP connection latency to key infrastructure endpoints.
 * Uses Node.js `net.createConnection` — no `ping` (which requires root).
 *
 * Endpoints: L1/L2/L3 RPC, Prometheus, Grafana, Cosmos LCD, Kong gateway.
 */
import * as net from "node:net";
import type { EndpointLatency, InfraNetworkState } from "../types.js";
import { MAX_LATENCY_MS } from "../policies/security-policy.js";

interface MonitoredEndpoint {
  host: string;
  port: number;
}

function parseHostPort(url: string, defaultPort: number): MonitoredEndpoint {
  try {
    const u    = new URL(url);
    const port = u.port ? parseInt(u.port, 10) : defaultPort;
    return { host: u.hostname, port };
  } catch {
    return { host: "127.0.0.1", port: defaultPort };
  }
}

const ENDPOINTS: MonitoredEndpoint[] = [
  parseHostPort(process.env.GHOSTCHAIN_L1_RPC ?? "http://127.0.0.1:18545",  18545),
  parseHostPort(process.env.GHOSTCHAIN_L2_RPC ?? "http://127.0.0.1:29545",  29545),
  parseHostPort(process.env.GHOSTCHAIN_L3_RPC ?? "http://127.0.0.1:39545",  39545),
  parseHostPort(process.env.COSMOS_LCD_URL    ?? "http://127.0.0.1:1317",    1317),
  parseHostPort(process.env.PROMETHEUS_URL    ?? "http://127.0.0.1:9090",    9090),
  parseHostPort(process.env.GRAFANA_URL       ?? "http://127.0.0.1:3000",    3000),
];

function tcpLatency(host: string, port: number, timeoutMs = 4_000): Promise<number | null> {
  return new Promise(resolve => {
    const start  = Date.now();
    const socket = net.createConnection({ host, port });

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve(latency);
    });
    socket.once("timeout", () => { socket.destroy(); resolve(null); });
    socket.once("error",   () => { socket.destroy(); resolve(null); });
  });
}

export async function analyzeInfraNetwork(): Promise<InfraNetworkState> {
  const results = await Promise.all(
    ENDPOINTS.map(async (ep): Promise<EndpointLatency> => ({
      host:    ep.host,
      port:    ep.port,
      latency: await tcpLatency(ep.host, ep.port),
    }))
  );

  const reachable    = results.filter(r => r.latency !== null);
  const unreachable  = results
    .filter(r => r.latency === null)
    .map(r => `${r.host}:${r.port}`);

  const avgLatency = reachable.length > 0
    ? reachable.reduce((sum, r) => sum + (r.latency ?? 0), 0) / reachable.length
    : null;

  return { endpoints: results, avgLatency, unreachable };
}

export { MAX_LATENCY_MS };
