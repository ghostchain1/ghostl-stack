/**
 * /api/command-center/runtime — GhostStack runtime & RPC health endpoint.
 *
 * Returns real-time health data for all three layers using the
 * GhostValidatorController and GhostRpcController from @ghostchain/sdk.
 *
 * Canonical chain IDs:
 *   L1 — GhostChain  (chainId 14000101, port 18545)
 *   L2 — GhostL2     (chainId 901,      port 29545)
 *   L3 — GhostL3     (chainId 903,      port 39545)
 *
 * Response shape: RuntimeStatus
 */
import { type NextRequest, NextResponse } from 'next/server';
import {
  GhostValidatorController,
  GhostRpcController,
  type ValidatorNodeStatus,
  type RpcEndpointStatus,
} from '@ghostchain/sdk';

// ── Canonical node configs — env-overridable ────────────────────────────────

const L1_RPC = process.env.GHOST_L1_RPC ?? process.env.RPC_L1 ?? 'http://localhost:18545';
const L2_RPC = process.env.GHOST_L2_RPC ?? process.env.RPC_L2 ?? 'http://localhost:29545';
const L3_RPC = process.env.GHOST_L3_RPC ?? process.env.RPC_L3 ?? 'http://localhost:39545';

function buildValidatorController(): GhostValidatorController {
  return new GhostValidatorController({
    timeoutMs: 5_000,
    nodes: [
      { name: 'ghostchain-l1',  layer: 'L1', rpcUrl: L1_RPC },
      { name: 'ghostl2-node',   layer: 'L2', rpcUrl: L2_RPC },
      { name: 'ghostl3-node',   layer: 'L3', rpcUrl: L3_RPC },
    ],
  });
}

function buildRpcController(): GhostRpcController {
  // Support comma-separated extra RPC pools via env:
  //   GHOST_L1_RPC_POOL=http://node1:18545,http://node2:18545
  const poolOf = (primary: string, envKey: string): string[] => {
    const extra = process.env[envKey] ?? '';
    const all = [primary, ...extra.split(',').map(s => s.trim()).filter(Boolean)];
    return [...new Set(all)]; // deduplicate
  };

  return new GhostRpcController({
    L1: poolOf(L1_RPC, 'GHOST_L1_RPC_POOL'),
    L2: poolOf(L2_RPC, 'GHOST_L2_RPC_POOL'),
    L3: poolOf(L3_RPC, 'GHOST_L3_RPC_POOL'),
  });
}

// ── Response types ─────────────────────────────────────────────────────────────

export type LayerRuntime = {
  layer: 'L1' | 'L2' | 'L3';
  chainId: number;
  blockNumber: number | null;
  peers: number | null;
  syncing: boolean | null;
  healthy: boolean;
  /** Approximate block lag behind parent layer (null if unavailable). */
  blockLag: number | null;
  rpcEndpoints: RpcEndpointStatus[];
  error?: string;
};

export type RuntimeStatus = {
  timestamp: string;
  healthy: boolean;
  layers: LayerRuntime[];
  /** Human-readable summary: "3/3 layers healthy" */
  summary: string;
};

const CHAIN_IDS: Record<string, number> = { L1: 14000101, L2: 901, L3: 903 };

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse<RuntimeStatus>> {
  const validatorCtrl = buildValidatorController();
  const rpcCtrl       = buildRpcController();

  // Probe RPC endpoints and fetch validator status concurrently.
  const [validatorStatuses, rpcStatuses, l3Lag, l2Lag] = await Promise.all([
    validatorCtrl.status().catch((): ValidatorNodeStatus[] => []),
    rpcCtrl.probeAll(4_000).catch((): RpcEndpointStatus[] => []),
    validatorCtrl.blockLag('L3').catch(() => null),
    validatorCtrl.blockLag('L2').catch(() => null),
  ]);

  const blockLagMap: Record<string, number | null> = {
    L1: 0,
    L2: l2Lag,
    L3: l3Lag,
  };

  const layers: LayerRuntime[] = (['L1', 'L2', 'L3'] as const).map(layer => {
    const node = validatorStatuses.find(n => n.layer === layer);
    const endpoints = rpcStatuses.filter(e => e.layer === layer);

    return {
      layer,
      chainId: CHAIN_IDS[layer] ?? 0,
      blockNumber: node?.blockNumber ?? null,
      peers: node?.peers ?? null,
      syncing: node?.syncing ?? null,
      healthy: node?.healthy ?? false,
      blockLag: blockLagMap[layer] ?? null,
      rpcEndpoints: endpoints,
      ...(node?.error ? { error: node.error } : {}),
    };
  });

  const healthyCount = layers.filter(l => l.healthy).length;
  const healthy      = healthyCount === layers.length;

  const body: RuntimeStatus = {
    timestamp: new Date().toISOString(),
    healthy,
    layers,
    summary: `${healthyCount}/${layers.length} layers healthy`,
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
