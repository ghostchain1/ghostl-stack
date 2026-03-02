/**
 * chain/contracts.ts — Typed ethers contract instances for L1 treasury kernel.
 *
 * ABIs are minimal interfaces (only the functions this service needs).
 * Full ABIs should be imported from forge artifacts in production CI.
 */

import { ethers } from 'ethers';
import type { Config } from '../config.js';
import type { ChainClient } from './client.js';

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

const RISK_ENGINE_ABI = [
  'function config() external view returns (uint256 minStableReserve, uint256 maxDailyVaR, uint256 maxWeeklyLoss, uint16 maxAssetConcentrationBps, uint16 maxStrategyConcentrationBps, uint16 stressMultiplierBps, bool circuitBreakerOpen)',
  'function lastKnownNAV() external view returns (uint256)',
  'function currentDailyLoss() external view returns (uint256)',
  'function currentWeeklyLoss() external view returns (uint256)',
  'function strategyAllocation(uint256 strategyId) external view returns (uint256)',
] as const;

const STRATEGY_REGISTRY_ABI = [
  'function strategyCount() external view returns (uint256)',
  'function getStrategy(uint256 id) external view returns (bytes32 label, uint16 maxAllocationBps, uint8 maxLeveragex100, uint16 maxDrawdownBps, uint32 cooldownSeconds, uint8 minOracleCount, uint8 riskTier, uint8 status, uint48 lastExecuted, int256 cumulativePnL)',
  'function isActive(uint256 id) external view returns (bool)',
] as const;

const TREASURY_GOVERNOR_ABI = [
  'function propose(bytes32 originatorHash, uint256 strategyId, address token, address target, uint256 amount, bytes calldata callData, uint8 layer, uint256 estNAVAfter, uint256 estStableReserveAfter, uint256 estAssetAlloc) external returns (uint256 id)',
  'function getProposal(uint256 id) external view returns (tuple(uint256 id, bytes32 originatorHash, uint256 strategyId, address token, address target, uint256 amount, bytes callData, uint8 status, uint8 layer, uint48 executeAfter, uint48 expireAt, uint256 estNAVAfter, uint256 estStableReserveAfter, uint256 estAssetAlloc, int256 realisedPnL))',
  'function proposalCount() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'function autoExecuteThreshold() external view returns (uint256)',
  'function shortTimelockSeconds() external view returns (uint32)',
  'function longTimelockSeconds() external view returns (uint32)',
] as const;

const TREASURY_VAULT_ABI = [
  'function balanceOf(address token) external view returns (uint256)',
] as const;

const PROOF_OF_SOLVENCY_ABI = [
  'function publish(uint256 nav, uint256 liabilities, bytes32 assetRoot, bytes32 ipfsCID) external returns (uint256 id)',
  'function snapshotCount() external view returns (uint256)',
  'function isSolvent() external view returns (bool)',
  'function latestSnapshot() external view returns (tuple(uint256 id, uint48 timestamp, uint256 nav, uint256 liabilities, uint256 surplus, bytes32 assetRoot, bytes32 ipfsCID, address publisher))',
] as const;

const REVENUE_ROUTER_ABI = [
  'function totalReceived(address token) external view returns (uint256)',
  'function bucketAllocated(uint8 bucket, address token) external view returns (uint256)',
] as const;

// ─── Contract registry ────────────────────────────────────────────────────────

export interface TreasuryContracts {
  riskEngine:       ethers.Contract;
  strategyRegistry: ethers.Contract;
  governor:         ethers.Contract;
  vault:            ethers.Contract;
  proofOfSolvency:  ethers.Contract;
  revenueRouter:    ethers.Contract;
}

export function getTreasuryContracts(
  cfg: Config,
  client: ChainClient,
): TreasuryContracts {
  const { wallet } = client;
  return {
    riskEngine:       new ethers.Contract(cfg.RISK_ENGINE_ADDRESS,       RISK_ENGINE_ABI,       wallet),
    strategyRegistry: new ethers.Contract(cfg.STRATEGY_REGISTRY_ADDRESS, STRATEGY_REGISTRY_ABI, wallet),
    governor:         new ethers.Contract(cfg.TREASURY_GOVERNOR_ADDRESS,  TREASURY_GOVERNOR_ABI, wallet),
    vault:            new ethers.Contract(cfg.TREASURY_VAULT_ADDRESS,     TREASURY_VAULT_ABI,    wallet),
    proofOfSolvency:  new ethers.Contract(cfg.PROOF_OF_SOLVENCY_ADDRESS,  PROOF_OF_SOLVENCY_ABI, wallet),
    revenueRouter:    new ethers.Contract(cfg.REVENUE_ROUTER_ADDRESS,     REVENUE_ROUTER_ABI,    wallet),
  };
}
