/**
 * blockchainApi.ts — Blockchain network data helpers
 *
 * Fetches chain metrics from GIN chain metrics endpoint (which aggregates
 * L1/L2/L3 data), AIM RPC node data, and provides helpers for on-chain stats.
 */

import type { GinChainMetric, AimRpcNode } from "./api";
export type { GinChainMetric, AimRpcNode };

const CHAIN_RPC = process.env["NEXT_PUBLIC_CHAIN_RPC"] ?? "http://localhost:8545";
const GIN_URL   = process.env["NEXT_PUBLIC_GIN_URL"]   ?? "http://localhost:9600";
const AIM_URL   = process.env["NEXT_PUBLIC_AIM_URL"]   ?? "http://localhost:9400";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainStats {
  chainId: string;
  layer: "L1" | "L2" | "L3";
  label: string;
  blockHeight: number;
  tps: number;
  gasPrice: string;
  status: "operational" | "degraded" | "congested" | "unknown";
  latencyMs: number;
  lastSeen: number;
}

export interface NetworkOverview {
  chains: ChainStats[];
  totalTps: number;
  healthyChains: number;
}

// ── Chain metrics via GIN ─────────────────────────────────────────────────────

export async function fetchChainMetrics(): Promise<GinChainMetric[] | null> {
  try {
    const r = await fetch(`${GIN_URL}/chains/metrics`, { cache: "no-store" });
    if (!r.ok) return null;
    const raw = await r.json() as { metrics?: GinChainMetric[] } | GinChainMetric[];
    return Array.isArray(raw) ? raw : (raw.metrics ?? null);
  } catch { return null; }
}

// ── RPC node list via AIM ─────────────────────────────────────────────────────

export async function fetchRpcNodes(): Promise<AimRpcNode[] | null> {
  try {
    const r = await fetch(`${AIM_URL}/rpc/nodes`, { cache: "no-store" });
    if (!r.ok) return null;
    const raw = await r.json() as { nodes?: AimRpcNode[] } | AimRpcNode[];
    return Array.isArray(raw) ? raw : (raw.nodes ?? null);
  } catch { return null; }
}

// ── L1 stats via JSON-RPC ─────────────────────────────────────────────────────

export interface L1Stats {
  blockNumber: number;
  chainId: number;
  gasPrice: bigint | null;
  syncing: boolean;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const r = await fetch(CHAIN_RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache:   "no-store",
    });
    if (!r.ok) return null;
    const data = await r.json() as { result?: T; error?: unknown };
    if (data.error) return null;
    return data.result ?? null;
  } catch { return null; }
}

export async function fetchL1Stats(): Promise<L1Stats | null> {
  const [blockHex, chainHex, gasPriceHex] = await Promise.all([
    rpc<string>("eth_blockNumber"),
    rpc<string>("eth_chainId"),
    rpc<string>("eth_gasPrice"),
  ]);
  if (!blockHex && !chainHex) return null;
  return {
    blockNumber: blockHex ? parseInt(blockHex, 16) : 0,
    chainId:     chainHex ? parseInt(chainHex, 16) : 0,
    gasPrice:    gasPriceHex ? BigInt(gasPriceHex) : null,
    syncing:     false,
  };
}

// ── Network overview aggregator ───────────────────────────────────────────────

export async function fetchNetworkOverview(): Promise<NetworkOverview> {
  const metrics = await fetchChainMetrics();
  const chains: ChainStats[] = (metrics ?? []).map((m) => ({
    chainId:     m.chain,
    layer:       "L1" as ChainStats["layer"],  // GIN doesn't expose layer; default to L1
    label:       m.chain,
    blockHeight: m.blockHeight ?? 0,
    tps:         m.tps ?? 0,
    gasPrice:    m.gasPriceGwei != null ? `${m.gasPriceGwei.toFixed(2)} Gwei` : "—",
    status:      (m.status as ChainStats["status"]) ?? "unknown",
    latencyMs:   m.latencyMs ?? 0,
    lastSeen:    m.ts ?? Date.now(),
  }));

  return {
    chains,
    totalTps:     chains.reduce((s, c) => s + c.tps, 0),
    healthyChains: chains.filter((c) => c.status === "operational").length,
  };
}

// ── Gas price formatter ───────────────────────────────────────────────────────

export function formatGwei(wei: bigint | null): string {
  if (!wei) return "—";
  const gwei = Number(wei) / 1e9;
  return `${gwei.toFixed(2)} Gwei`;
}
