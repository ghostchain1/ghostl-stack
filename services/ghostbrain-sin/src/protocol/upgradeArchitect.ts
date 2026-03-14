// SIN — Upgrade Architect
// Generates detailed upgrade blueprints for protocol upgrade proposals.
// Each blueprint includes migration steps, a rollback plan, risk mitigation,
// and an estimated maintenance-window duration.
// DETECT-AND-PROPOSE only — blueprints are advisory; governance ratifies.

import { randomUUID }   from 'crypto';
import { API_BASE }     from '../config/sinConfig.js';
import type { UpgradeBlueprint, UpgradeCategory } from '../types.js';

interface ChainInfo { blockTime?: number; version?: string; gasLimit?: number }

async function getChainInfo(layer: 'l1' | 'l2' | 'l3'): Promise<ChainInfo> {
  try {
    const res = await fetch(`${API_BASE}/api/chains/${layer}/metrics`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return {};
    return await res.json() as ChainInfo;
  } catch { return {}; }
}

function migrationStepsFor(type: UpgradeCategory, chain: 'L1' | 'L2' | 'L3' | 'all'): string[] {
  const prefix = chain === 'all' ? 'L1/L2/L3' : chain;
  switch (type) {
    case 'consensus-parameter':
      return [
        `Snapshot ${prefix} state at upgrade block`,
        'Distribute updated genesis config to all validators',
        'Coordinate block-time parameter change via governance transaction',
        'Monitor first 100 blocks post-change for latency drift',
        'Emit governance event to confirm parameter activation',
      ];
    case 'evm-version':
      return [
        `Audit ${prefix} contracts for EVM-version compatibility`,
        'Deploy canary upgrade to testnet (chain_id 903)',
        'Run 48-hour observability period on testnet',
        'Stage upgrade to L2 (chain_id 901) with 24-hour monitoring',
        `Execute ${prefix} upgrade via governance proposal`,
        'Verify opcode behaviour in production via post-upgrade smoke test',
      ];
    case 'opstack-version':
      return [
        'Pin new op-geth / op-node version in infra manifests',
        'Run docker-compose integration test against ghostchain-devnet',
        'Update `chains/l2/rollup.json` and `chains/l3/rollup.json` config hashes',
        'Stage blue/green deployment: bring up new nodes, drain old',
        'Confirm L1 → L2 → L3 message routing works end-to-end',
        'Cut over sequencer and decommission old nodes',
      ];
    case 'bridge-upgrade':
      return [
        'Pause bridge ingress via CircuitBreaker.pause()',
        'Drain in-flight cross-layer messages',
        `Deploy new bridge contracts to ${prefix}`,
        'Migrate pending escrow balances',
        'Run post-deploy routing verification (`npm run verify:routing`)',
        'Re-enable bridge after 2-hour observation window',
      ];
    case 'gas-model':
      return [
        'Model EIP-1559–style base-fee curve for GhostChain gas engine',
        'Run gas simulations against historic transaction load',
        `Deploy updated gas oracle to ${prefix} testnet`,
        'Calibrate burn multiplier against SIN_RULES.targetBurnRatePct',
        'Submit governance proposal with on-chain parameter update',
        'Monitor average gas price for 1 week post-activation',
      ];
    default:
      return [
        `Audit ${prefix} for upgrade compatibility`,
        'Deploy to testnet and run full test suite',
        'Submit governance proposal for mainnet activation',
      ];
  }
}

export async function architectUpgrades(): Promise<UpgradeBlueprint[]> {
  // Fetch chain info for context
  const [l1, l2, l3] = await Promise.all([
    getChainInfo('l1'), getChainInfo('l2'), getChainInfo('l3'),
  ]);

  const blueprints: UpgradeBlueprint[] = [];

  // Consensus tuning — if block time data available
  if (l1.blockTime && l1.blockTime > 4) {
    blueprints.push({
      id: randomUUID(),
      upgradeType: 'consensus-parameter',
      targetChain: 'L1',
      migrationSteps: migrationStepsFor('consensus-parameter', 'L1'),
      rollbackPlan: 'Revert consensus config via governance emergency param reset; requires 51% quorum',
      estimatedWindowHours: 4,
      riskMitigation: 'Phase rollout: test on L3, then L2, then L1; monitor finality gaps after each step',
      createdAt: Date.now(),
    });
  }

  // Gas model review — if gas limit known and high
  if (l2.gasLimit && l2.gasLimit > 30_000_000) {
    blueprints.push({
      id: randomUUID(),
      upgradeType: 'gas-model',
      targetChain: 'L2',
      migrationSteps: migrationStepsFor('gas-model', 'L2'),
      rollbackPlan: 'Restore previous gas oracle params via signed governance rollback transaction',
      estimatedWindowHours: 2,
      riskMitigation: 'Shadow-mode trial: run new gas model in parallel for 24 h before cutover',
      createdAt: Date.now(),
    });
  }

  // OP Stack version review — always scheduled quarterly
  const l2Version = l2.version ?? '0';
  const needsOpStackReview = !l2Version.startsWith('v1.') || l2Version < 'v1.9';
  if (needsOpStackReview || blueprints.length === 0) {
    blueprints.push({
      id: randomUUID(),
      upgradeType: 'opstack-version',
      targetChain: 'all',
      migrationSteps: migrationStepsFor('opstack-version', 'all'),
      rollbackPlan: 'Rollback via docker image tag revert + config hash restore; no state migration needed',
      estimatedWindowHours: 6,
      riskMitigation: 'Blue/green deployment with zero-downtime sequencer handoff; full integration test before cutover',
      createdAt: Date.now(),
    });
  }

  // Suppress AI-only zero-info blueprints — need at least useful chain data
  void l3; // l3 info held for future EVM version blueprint logic

  return blueprints;
}
