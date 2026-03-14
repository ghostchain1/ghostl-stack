// Global Liquidity Mesh — builds cross-region GST balance map across all three chains

import { API_BASE, CHAIN, REGIONS } from '../config/planetConfig.js';
import type { ChainId, LiquidityMeshSnapshot, MeshImbalance, MeshNode } from '../types.js';

interface LiquidityApiEntry {
  region?: string;
  chainId?: number;
  gstBalance?: string; // bigint as string from API
  targetBalance?: string;
  utilisation?: number;
}

function toChainId(raw: number | undefined): ChainId {
  if (raw === CHAIN.L2) return CHAIN.L2;
  if (raw === CHAIN.L3) return CHAIN.L3;
  return CHAIN.L1;
}

export async function buildLiquidityMesh(): Promise<LiquidityMeshSnapshot> {
  let entries: LiquidityApiEntry[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/econ/liquidity`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      entries = (await res.json()) as LiquidityApiEntry[];
    }
  } catch {
    // proceed with synthetic zero-state
  }

  // If API has data per region+chain use it; otherwise synthesise per REGIONS × chains
  const chains: ChainId[] = [CHAIN.L1, CHAIN.L2, CHAIN.L3];
  const nodes: MeshNode[] = [];

  for (const region of REGIONS) {
    for (const cid of chains) {
      const match = entries.find(
        (e) => e.region === region.id && toChainId(e.chainId) === cid,
      );
      const gstBalance    = BigInt(match?.gstBalance    ?? '0');
      const targetBalance = BigInt(match?.targetBalance ?? '100000000000000000000'); // 100 GST
      const utilisation   = match?.utilisation ?? 0;
      nodes.push({ regionId: region.id, chainId: cid, gstBalance, targetBalance, utilisation });
    }
  }

  // Detect cross-region imbalances per chain
  const imbalances: MeshImbalance[] = [];
  for (const cid of chains) {
    const chainNodes = nodes.filter((n) => n.chainId === cid);
    if (!chainNodes.length) continue;

    const totalGst = chainNodes.reduce((s, n) => s + n.gstBalance, 0n);
    const avgGst   = totalGst / BigInt(chainNodes.length);
    if (avgGst === 0n) continue;

    // Sort: surplus first (positive delta), then deficit (negative delta)
    const sorted = [...chainNodes].sort((a, b) =>
      Number(b.gstBalance - b.targetBalance) -
      Number(a.gstBalance - a.targetBalance),
    );

    const surplus = sorted[0];
    const deficit = sorted[sorted.length - 1];
    if (!surplus || !deficit || surplus.regionId === deficit.regionId) continue;

    const delta = surplus.gstBalance - deficit.gstBalance;
    const imbalancePct = avgGst > 0n
      ? Number((delta * 100n) / avgGst)
      : 0;

    if (Math.abs(imbalancePct) >= 25) {
      imbalances.push({
        surplus:     surplus.regionId,
        deficit:     deficit.regionId,
        chainId:     cid,
        deltaGst:    delta > 0n ? delta : -delta,
        imbalancePct: Math.abs(imbalancePct),
      });
    }
  }

  const totalGstLocked = nodes.reduce((s, n) => s + n.gstBalance, 0n);
  const globalUtilisation = nodes.length
    ? nodes.reduce((s, n) => s + n.utilisation, 0) / nodes.length
    : 0;

  return { nodes, imbalances, totalGstLocked, globalUtilisation };
}
