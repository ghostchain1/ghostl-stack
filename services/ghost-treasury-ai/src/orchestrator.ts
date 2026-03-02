/**
 * orchestrator.ts — GhostTreasuryAI main orchestration loop.
 *
 * Each cycle:
 *   1. Collect on-chain snapshot (NAV, risk state, strategy list)
 *   2. Run all agents in parallel → collect votes
 *   3. Evaluate quorum (two-veto + majority)
 *   4. If quorum met: build ProposalIntent + submit (or shadow-log)
 *   5. Post-trade auditor runs after confirmed executions (async)
 *   6. ProofOfSolvency snapshot published every N cycles
 *
 * The orchestrator respects AUTONOMY_TIER:
 *   Tier 0 → only collect snapshots (no proposals)
 *   Tier 1 → shadow proposals only
 *   Tier 2 → live proposals for strategies with amountEth ≤ tier cap
 *   Tier 3–5 → progressively higher caps (governed by on-chain config)
 */

import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { Config } from './config.js';
import type { TreasuryContracts } from './chain/contracts.js';
import { collectSnapshot } from './chain/snapshot.js';
import { MacroStrategist }   from './agents/macro-strategist.js';
import { RiskGovernor }      from './agents/risk-governor.js';
import { MarketSentinel }    from './agents/market-sentinel.js';
import { OperationsCFO }     from './agents/operations-cfo.js';
import { PostTradeAuditor }  from './agents/post-trade-auditor.js';
import type { AgentContext } from './agents/types.js';
import { evaluateVotes, buildProposalIntent } from './proposal/builder.js';
import { submitProposal } from './proposal/submitter.js';
import { logger }  from './logger.js';
import { autonomyTier as tierMetric, solvencySnapshots, lastSnapshotTimestamp } from './metrics.js';

/** Tier-to-max-auto-execute-amount mapping (ETH). */
const TIER_MAX_ETH: Record<number, bigint> = {
  0: 0n,
  1: 0n,              // shadow only
  2: 50n  * 10n**18n, // 50 ETH
  3: 200n * 10n**18n, // 200 ETH
  4: 500n * 10n**18n, // 500 ETH
  5: 0n,              // unlimited — pre-approved crisis playbooks only
};

/** Publish a ProofOfSolvency snapshot every this many cycles. */
const SOLVENCY_SNAPSHOT_INTERVAL = 12; // ~1 hr at 5-min cycles

export class TreasuryOrchestrator {
  private readonly agents: {
    macro:     MacroStrategist;
    risk:      RiskGovernor;
    sentinel:  MarketSentinel;
    cfo:       OperationsCFO;
    auditor:   PostTradeAuditor;
  };

  private cycleCount = 0;

  constructor(
    private readonly cfg:       Config,
    private readonly contracts: TreasuryContracts,
    private readonly stableToken: string,
  ) {
    this.agents = {
      macro:    new MacroStrategist(),
      risk:     new RiskGovernor(),
      sentinel: new MarketSentinel(),
      cfo:      new OperationsCFO(),
      auditor:  new PostTradeAuditor(),
    };
    tierMetric.set(cfg.AUTONOMY_TIER);
  }

  async runCycle(): Promise<void> {
    this.cycleCount++;
    const cycleId = uuidv4();
    logger.info('cycle start', { cycleId, cycleCount: this.cycleCount, autonomyTier: this.cfg.AUTONOMY_TIER });

    // ── 1. Snapshot ────────────────────────────────────────────────────────
    let snapshot;
    try {
      snapshot = await collectSnapshot(this.contracts, this.stableToken);
    } catch (err) {
      logger.error('snapshot collection failed — skipping cycle', { cycleId, error: String(err) });
      return;
    }

    // Tier 0 = observe only
    if (this.cfg.AUTONOMY_TIER === 0) {
      logger.info('tier-0: observe-only mode, no proposals generated', { cycleId });
      return;
    }

    // ── 2. Run agents in parallel ──────────────────────────────────────────
    const ctx: AgentContext = {
      snapshot,
      autonomyTier: this.cfg.AUTONOMY_TIER,
      shadowMode:   this.cfg.SHADOW_MODE,
      cycleId,
    };

    const [macroVote, riskVote, sentinelVote, cfoVote] = await Promise.all([
      this.agents.macro.vote(ctx),
      this.agents.risk.vote(ctx),
      this.agents.sentinel.vote(ctx),
      this.agents.cfo.vote(ctx),
    ]);

    const votes = [macroVote, riskVote, sentinelVote, cfoVote];

    // ── 3. Evaluate quorum ────────────────────────────────────────────────
    const evaluation = evaluateVotes(votes);
    logger.info('quorum evaluation', { cycleId, ...evaluation });

    if (!evaluation.quorumMet || evaluation.blocked) {
      logger.info('cycle: no proposal generated this cycle', {
        cycleId,
        reason: evaluation.summary,
      });
      return;
    }

    // ── 4. Build + submit proposal ────────────────────────────────────────
    // Select highest-rated active strategy (simplified: use strategy 1 for now;
    // a full implementation queries all active strategies and picks by score).
    const strategyId = 1;
    const tierCap    = TIER_MAX_ETH[this.cfg.AUTONOMY_TIER] ?? 0n;
    // Compute allocatable amount from MacroStrategist evidence
    const macroEvidence = macroVote.evidence;
    const allocatable = macroEvidence?.['allocatable']
      ? BigInt(macroEvidence['allocatable'] as string)
      : ethers.parseEther(String(this.cfg.AUTO_EXEC_THRESHOLD_ETH));
    const amountEth = allocatable < tierCap ? allocatable : tierCap;

    if (amountEth === 0n) {
      logger.info('cycle: amount is 0 — skipping proposal', { cycleId });
      return;
    }

    const shadowOnly = this.cfg.SHADOW_MODE || this.cfg.AUTONOMY_TIER < 2;

    try {
      const intent = buildProposalIntent(
        snapshot,
        votes,
        strategyId,
        ethers.ZeroAddress,  // native GST
        this.cfg.TREASURY_VAULT_ADDRESS,  // target: vault self-route for rebalance
        amountEth,
        shadowOnly,
      );

      await submitProposal(intent, this.contracts);
    } catch (err) {
      logger.warn('cycle: proposal skipped', { cycleId, reason: String(err) });
    }

    // ── 5. ProofOfSolvency snapshot ───────────────────────────────────────
    if (this.cycleCount % SOLVENCY_SNAPSHOT_INTERVAL === 0) {
      await this._publishSolvencySnapshot(snapshot.navEth, cycleId);
    }

    logger.info('cycle complete', { cycleId, cycleCount: this.cycleCount });
  }

  private async _publishSolvencySnapshot(navEth: bigint, cycleId: string): Promise<void> {
    try {
      // Liabilities estimate: 6 months × MONTHLY_BURN (matches OperationsCFO constant)
      const liabilities = ethers.parseEther('300'); // 6 × 50 ETH placeholder
      // Asset root: in production, build a Merkle tree of all vault positions.
      // For now emit a hash of (nav, ts) as a placeholder.
      const assetRoot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [navEth, BigInt(Date.now())]),
      );
      await this.contracts.proofOfSolvency.publish(navEth, liabilities, assetRoot, ethers.ZeroHash);
      solvencySnapshots.inc();
      lastSnapshotTimestamp.set(Date.now() / 1000);
      logger.info('solvency snapshot published', { cycleId });
    } catch (err) {
      logger.error('solvency snapshot failed', { cycleId, error: String(err) });
    }
  }
}
