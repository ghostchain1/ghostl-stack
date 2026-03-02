/**
 * chain/snapshot.ts — Reads L1 contract state into a MarketSnapshot.
 *
 * Called at the start of each orchestrator cycle. All BigInt values
 * are in wei. Sequencer fee rate is approximated from L1 base fee
 * until a dedicated oracle feed is wired.
 */

import { ethers } from 'ethers';
import type { TreasuryContracts } from './contracts.js';
import type { MarketSnapshot } from '../agents/types.js';
import { logger } from '../logger.js';
import {
  treasuryNAV,
  stableReserve,
  dailyVaR,
  weeklyLoss,
  circuitBreakerState,
} from '../metrics.js';

export async function collectSnapshot(
  contracts: TreasuryContracts,
  stableToken: string,                 // ERC-20 address of stable reserve token
): Promise<MarketSnapshot> {
  const [
    navRaw,
    riskCfgRaw,
    dailyVarRaw,
    weeklyLossRaw,
    stableBalRaw,
  ] = await Promise.all([
    contracts.riskEngine.lastKnownNAV(),
    contracts.riskEngine.config(),
    contracts.riskEngine.currentDailyLoss(),
    contracts.riskEngine.currentWeeklyLoss(),
    contracts.vault.balanceOf(stableToken),
  ]);

  const nav        = BigInt(navRaw.toString());
  const stableRes  = BigInt(stableBalRaw.toString());
  const dailyVarV  = BigInt(dailyVarRaw.toString());
  const weeklyLossV= BigInt(weeklyLossRaw.toString());
  const cbOpen     = Boolean(riskCfgRaw.circuitBreakerOpen);

  // Update Prometheus metrics
  treasuryNAV.set(Number(ethers.formatEther(nav)));
  stableReserve.set(Number(ethers.formatEther(stableRes)));
  dailyVaR.set(Number(ethers.formatEther(dailyVarV)));
  weeklyLoss.set(Number(ethers.formatEther(weeklyLossV)));
  circuitBreakerState.set(cbOpen ? 1 : 0);

  // Approximate sequencer fee from provider (fallback to 50 gwei if unavailable)
  let seqFeeGwei = 50;
  try {
    const feeData = await contracts.riskEngine.runner?.provider?.getFeeData?.();
    if (feeData?.gasPrice != null) {
      seqFeeGwei = Math.round(Number(ethers.formatUnits(feeData.gasPrice, 'gwei')));
    }
  } catch {
    logger.warn('snapshot: could not read L1 gas price, using default');
  }

  const snapshot: MarketSnapshot = {
    timestamp:            Date.now(),
    navEth:               nav,
    stableReserveEth:     stableRes,
    dailyVaREth:          dailyVarV,
    weeklyLossEth:        weeklyLossV,
    circuitBreakerOpen:   cbOpen,
    strategyCount:        Number(await contracts.strategyRegistry.strategyCount()),
    sequencerFeeRateGwei: seqFeeGwei,
  };

  logger.info('snapshot collected', {
    navEth:        ethers.formatEther(nav),
    stableEth:     ethers.formatEther(stableRes),
    dailyVarEth:   ethers.formatEther(dailyVarV),
    weeklyLossEth: ethers.formatEther(weeklyLossV),
    cbOpen,
    seqFeeGwei,
  });

  return snapshot;
}
