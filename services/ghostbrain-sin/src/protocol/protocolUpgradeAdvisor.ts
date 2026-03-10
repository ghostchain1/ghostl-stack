// Protocol Upgrade Advisor — proposes protocol upgrade candidates based on
// chain telemetry (block time, gas usage, opstack version drift).
// Drafts only; all upgrades require multi-sig governance ratification.

import { randomUUID } from 'crypto';
import { API_BASE, QUORUM } from '../config/sinConfig.js';
import type { ProtocolUpgradeProposal, UpgradeCategory } from '../types.js';

interface ChainMetrics {
  chainId?:     number;
  blockTimeMs?: number;
  gasUsedPct?:  number;
  opstackVer?:  string;
  evmVersion?:  string;
}

const TARGET_BLOCK_TIME_L1 = 6_000;  // ms
const TARGET_BLOCK_TIME_L2 = 2_000;
const TARGET_BLOCK_TIME_L3 = 1_000;
const GAS_CONGESTION_PCT   = 85;

function targetBlockTime(chainId: number): number {
  if (chainId === 901) return TARGET_BLOCK_TIME_L2;
  if (chainId === 903) return TARGET_BLOCK_TIME_L3;
  return TARGET_BLOCK_TIME_L1;
}

function layerLabel(chainId: number): 'L1' | 'L2' | 'L3' {
  if (chainId === 901) return 'L2';
  if (chainId === 903) return 'L3';
  return 'L1';
}

function makeProposal(
  upgradeType: UpgradeCategory,
  description: string,
  targetChain: 'L1' | 'L2' | 'L3' | 'all',
  riskLevel: ProtocolUpgradeProposal['riskLevel'],
  estimatedImpact: string,
): ProtocolUpgradeProposal {
  return {
    id:       randomUUID(),
    upgradeType,
    description,
    targetChain,
    riskLevel,
    estimatedImpact,
    requiresGovernanceQuorum: QUORUM[riskLevel] ?? QUORUM['medium'],
  };
}

export async function proposeProtocolUpgrades(): Promise<ProtocolUpgradeProposal[]> {
  const proposals: ProtocolUpgradeProposal[] = [];

  const chainIds = [14000101, 901, 903];
  const results = await Promise.allSettled(
    chainIds.map(async (cid) => {
      const label = layerLabel(cid).toLowerCase();
      try {
        const res = await fetch(`${API_BASE}/api/chains/${label}/metrics`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const m = (await res.json()) as ChainMetrics;
          return { ...m, chainId: cid };
        }
      } catch { /* offline */ }
      return null;
    }),
  );

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const m   = result.value;
    const cid = m.chainId ?? 14000101;
    const layer = layerLabel(cid);
    const target = targetBlockTime(cid);

    // Block time too slow — consensus tuning
    if ((m.blockTimeMs ?? 0) > target * 2) {
      proposals.push(makeProposal(
        'consensus-parameter',
        `${layer} block time ${m.blockTimeMs} ms exceeds 2× target (${target} ms) — propose consensus parameter tuning`,
        layer,
        'medium',
        'Faster finality, reduced latency for L3 → L2 → L1 settlement',
      ));
    }

    // Gas congestion — gas model upgrade
    if ((m.gasUsedPct ?? 0) > GAS_CONGESTION_PCT) {
      proposals.push(makeProposal(
        'gas-model',
        `${layer} gas utilisation at ${m.gasUsedPct}% — propose EIP-4844-equivalent gas model upgrade`,
        layer,
        'high',
        'Reduces gas price volatility; improves UX for GhostXchange and bridge users',
      ));
    }
  }

  // Periodic OP Stack version review (informational, low risk)
  proposals.push(makeProposal(
    'opstack-version',
    'Quarterly OP Stack version review — check for security patches and performance improvements',
    'all',
    'low',
    'Keeps L2/L3 nodes on current OP Stack release; critical for ongoing security updates',
  ));

  return proposals;
}
