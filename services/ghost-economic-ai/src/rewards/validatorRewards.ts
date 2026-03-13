/**
 * Validator Rewards Optimizer
 *
 * Fetches validator state from the Cosmos LCD endpoint and submits
 * advisory reward-adjustment proposals when participation is outside
 * the target band defined in stakingOptimizer.ts.
 *
 * Signal sources:
 *   - validator uptime (jailed count)
 *   - bonded token distribution
 *   - participation rate (active / total)
 */

import { type ValidatorInfo, type ValidatorMetrics, type EconomicProposal } from '../types.js';
import { submitProposal }                                                    from '../proposals.js';
import { computeStakingRecommendation }                                      from './stakingOptimizer.js';

const COSMOS_LCD_URL = process.env.COSMOS_LCD_URL ?? 'http://localhost:1317';
const COOLDOWN_MS    = Number(process.env.AEE_REWARDS_COOLDOWN_MIN ?? 60) * 60_000;

let _lastProposalTs = 0;
let _lastMetrics: ValidatorMetrics | null = null;

export function getValidatorMetrics(): ValidatorMetrics | null {
  return _lastMetrics;
}

// ── Cosmos LCD fetch ───────────────────────────────────────────────────────────

interface CosmosValidator {
  operator_address: string;
  description:      { moniker: string };
  status:           string;
  tokens:           string;
  jailed:           boolean;
}

async function fetchValidators(): Promise<ValidatorInfo[]> {
  const url = `${COSMOS_LCD_URL}/cosmos/staking/v1beta1/validators?pagination.limit=200`;
  const http = await import('node:http');
  const https = await import('node:https');

  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Bad LCD URL: ${url}`)); return; }

    const reqFn = parsed.protocol === 'https:' ? https.request : http.request;
    const req = reqFn({ hostname: parsed.hostname, port: parsed.port || 1317, path: parsed.pathname + parsed.search, method: 'GET', timeout: 6000 }, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try {
          const body = JSON.parse(raw) as { validators?: CosmosValidator[] };
          const validators = (body.validators ?? []).map((v): ValidatorInfo => ({
            operatorAddress: v.operator_address,
            moniker:         v.description.moniker,
            status:          v.status as ValidatorInfo['status'],
            bondedTokensGst: Number(BigInt(v.tokens) / BigInt('1000000000000000000')),
            jailed:          v.jailed,
          }));
          resolve(validators);
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('LCD timeout')); });
    req.end();
  });
}

function buildMetrics(validators: ValidatorInfo[]): ValidatorMetrics {
  const bonded = validators.filter((v) => v.status === 'BOND_STATUS_BONDED');
  const jailed = validators.filter((v) => v.jailed);
  const totalBondedGst = bonded.reduce((s, v) => s + v.bondedTokensGst, 0);
  return {
    activeCount:       bonded.length,
    jailedCount:       jailed.length,
    totalBondedGst,
    participationRate: validators.length > 0 ? bonded.length / validators.length : 0,
    ts:                Date.now(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function optimizeRewards(): Promise<EconomicProposal | null> {
  let validators: ValidatorInfo[];
  try {
    validators = await fetchValidators();
  } catch (err) {
    console.warn('[AEE:rewards] LCD unavailable:', (err as Error).message);
    return null;
  }

  const metrics = buildMetrics(validators);
  _lastMetrics  = metrics;

  console.log(
    `[AEE:rewards] active=${metrics.activeCount} jailed=${metrics.jailedCount} ` +
    `participation=${(metrics.participationRate * 100).toFixed(1)}%`
  );

  const recommendation = computeStakingRecommendation(metrics);
  if (recommendation.direction === 'hold') return null;

  // Cooldown guard
  const now = Date.now();
  if (now - _lastProposalTs < COOLDOWN_MS) return null;

  const proposal: EconomicProposal = {
    id:      `aee-rewards-${now}`,
    ts:      now,
    source:  'ghost-economic-ai',
    target:  'rewards',
    action:  `adjust_validator_rewards_${recommendation.direction}`,
    reason:  recommendation.reason,
    advisory: true,
    metadata: {
      adjustmentPct:    recommendation.adjustmentPct,
      participationPct: recommendation.participationPct.toFixed(1),
      activeValidators: metrics.activeCount,
      jailedValidators: metrics.jailedCount,
      totalBondedGst:   metrics.totalBondedGst.toFixed(0),
    },
  };

  await submitProposal(proposal);
  _lastProposalTs = now;
  return proposal;
}
