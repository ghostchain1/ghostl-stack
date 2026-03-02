/**
 * proposal/submitter.ts — Submits a ProposalIntent to the on-chain
 * TreasuryGovernor and updates Prometheus counters.
 *
 * Shadow mode: logs the intent but does NOT send a transaction.
 * Live mode:  submits via the proposer wallet.
 */

import { ethers } from 'ethers';
import type { TreasuryContracts } from '../chain/contracts.js';
import type { ProposalIntent } from '../agents/types.js';
import { logger } from '../logger.js';
import {
  proposalsTotal,
  proposalsExecuted,
  shadowProposals,
} from '../metrics.js';

export interface SubmitResult {
  mode:       'shadow' | 'live';
  txHash?:    string;
  proposalId?: number;
  error?:     string;
}

export async function submitProposal(
  intent:    ProposalIntent,
  contracts: TreasuryContracts,
): Promise<SubmitResult> {
  if (intent.shadowOnly) {
    shadowProposals.inc();
    logger.info('shadow-mode proposal (not submitted on-chain)', {
      offChainId: intent.id,
      strategyId: intent.strategyId,
      amountEth:  ethers.formatEther(intent.amountEth),
      rationale:  intent.rationale,
    });
    return { mode: 'shadow' };
  }

  try {
    const tx = await contracts.governor.propose(
      ethers.encodeBytes32String(intent.originatorHash.slice(0, 31)),
      intent.strategyId,
      intent.token,
      intent.target,
      intent.amountEth,
      intent.callData,
      intent.layer,
      intent.estNAVAfterEth,
      intent.estStableAfterEth,
      intent.estAssetAlloc,
    );

    logger.info('proposal submitted on-chain', {
      offChainId: intent.id,
      txHash:     tx.hash,
      strategyId: intent.strategyId,
      amountEth:  ethers.formatEther(intent.amountEth),
    });

    const receipt = await tx.wait();
    const proposalId = _extractProposalId(receipt);

    proposalsTotal.inc({ status: 'submitted', strategy_id: String(intent.strategyId), layer: String(intent.layer) });
    if (proposalId !== undefined) proposalsExecuted.inc({ strategy_id: String(intent.strategyId) });

    return { mode: 'live', txHash: tx.hash, proposalId };
  } catch (err) {
    const msg = String(err);
    logger.error('proposal submission failed', {
      offChainId: intent.id,
      error:      msg,
    });
    proposalsTotal.inc({ status: 'failed', strategy_id: String(intent.strategyId), layer: String(intent.layer) });
    return { mode: 'live', error: msg };
  }
}

function _extractProposalId(receipt: ethers.TransactionReceipt | null): number | undefined {
  if (!receipt) return undefined;
  // ProposalCreated(uint256 indexed id, ...)
  const iface = new ethers.Interface([
    'event ProposalCreated(uint256 indexed id, uint256 indexed strategyId, address indexed target, uint256 amount, uint48 executeAfter)',
  ]);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'ProposalCreated') {
        return Number(parsed.args['id']);
      }
    } catch { /* not our event */ }
  }
  return undefined;
}
