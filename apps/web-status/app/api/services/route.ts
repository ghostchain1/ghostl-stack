import { GHOST_RPC_ENDPOINTS, GHOST_SITES } from "@ghostchain/config";
import { NextResponse } from "next/server";

type ServiceStatus = "operational" | "degraded" | "outage";

type ServiceState = {
  name: string;
  status: ServiceStatus;
  latency?: number;
  uptime?: string;
};

const SERVICE_TARGETS = [
  { kind: "rpc" as const, name: "L1 RPC", url: GHOST_RPC_ENDPOINTS.l1.publicUrl, expectedChainId: GHOST_RPC_ENDPOINTS.l1.chainId },
  { kind: "rpc" as const, name: "L2 RPC", url: GHOST_RPC_ENDPOINTS.l2.publicUrl, expectedChainId: GHOST_RPC_ENDPOINTS.l2.chainId },
  { kind: "rpc" as const, name: "L3 RPC", url: GHOST_RPC_ENDPOINTS.l3.publicUrl, expectedChainId: GHOST_RPC_ENDPOINTS.l3.chainId },
  { kind: "http" as const, name: "GhostScan", url: GHOST_SITES.explorer.url },
  { kind: "http" as const, name: "Bridge", url: GHOST_SITES.bridge.url },
  { kind: "http" as const, name: GHOST_SITES.governance.domain, url: GHOST_SITES.governance.url },
  { kind: "http" as const, name: GHOST_SITES.apps.domain, url: GHOST_SITES.apps.url },
  { kind: "http" as const, name: GHOST_SITES.portal.domain, url: GHOST_SITES.portal.url },
];

const toUptime = (status: ServiceStatus) => {
  if (status === "operational") return "100.000%";
  if (status === "degraded") return "99.500%";
  return "0.000%";
};

const probeHttp = async (name: string, url: string): Promise<ServiceState> => {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const latency = Date.now() - startedAt;
    const healthy = res.ok || [301, 302, 307, 308, 405].includes(res.status);
    const status: ServiceStatus = healthy ? "operational" : res.status >= 500 ? "outage" : "degraded";
    return { name, status, latency, uptime: toUptime(status) };
  } catch {
    return { name, status: "outage", uptime: toUptime("outage") };
  }
};

const decodeHex = (value: unknown) => Number.parseInt(String(value || "0x0"), 16);

const probeRpc = async (name: string, url: string, expectedChainId: number): Promise<ServiceState> => {
  const startedAt = Date.now();
  try {
    const payload = (method: string) =>
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: [],
      });

    const request = async (method: string) =>
      fetch(url, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "content-type": "application/json" },
        body: payload(method),
      });

    let res = await request("ghost_chainId");
    let data = (await res.json().catch(() => ({}))) as { result?: string; error?: { message?: string }; status?: string };

    if (data.error || !data.result) {
      res = await request("ghost_chainId");
      data = (await res.json().catch(() => ({}))) as { result?: string; error?: { message?: string }; status?: string };
    }

    const latency = Date.now() - startedAt;
    if (data.result) {
      const chainId = decodeHex(data.result);
      const status: ServiceStatus = chainId === expectedChainId ? "operational" : "degraded";
      return { name, status, latency, uptime: toUptime(status) };
    }

    const status: ServiceStatus = res.status === 503 ? "degraded" : "outage";
    return { name, status, latency, uptime: toUptime(status) };
  } catch {
    return { name, status: "outage", uptime: toUptime("outage") };
  }
};

export async function GET() {
  const services = await Promise.all(
    SERVICE_TARGETS.map((target) =>
      target.kind === "rpc"
        ? probeRpc(target.name, target.url, target.expectedChainId)
        : probeHttp(target.name, target.url)
    )
  );

  return NextResponse.json({ services, checkedAt: new Date().toISOString() });
}
