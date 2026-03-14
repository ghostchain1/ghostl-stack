/**
 * Treasury Manager
 *
 * Monitors the GhostChain L1 treasury balance and proposes capital actions.
 * All proposals require human ratification — no autonomous fund movement.
 *
 * Policy (from economic-policy.ts):
 *   - balance > TREASURY_INVEST_THRESHOLD → propose capital deployment
 *   - balance < TREASURY_MIN_BALANCE      → propose GST buyback to defend floor
 */
import { randomUUID } from "node:crypto";
import type { NetworkState, GovernorProposal } from "../types.js";
import { ECONOMIC_POLICY } from "../policies/economic-policy.js";

export async function manageTreasury(network: NetworkState): Promise<GovernorProposal[]> {
  const proposals: GovernorProposal[] = [];
  const { treasury } = network;
  const now = Date.now();

  // Propose capital investment when treasury is well-funded
  if (treasury.balanceL1 > ECONOMIC_POLICY.TREASURY_INVEST_THRESHOLD) {
    const excessWei  = treasury.balanceL1 - ECONOMIC_POLICY.TREASURY_INVEST_THRESHOLD;
    const excessGST  = excessWei / 10n ** 18n;

    proposals.push({
      id:          randomUUID(),
      type:        "treasury_invest",
      description: `Treasury balance ${treasury.balanceL1 / 10n ** 18n} GST exceeds investment threshold ${ECONOMIC_POLICY.TREASURY_INVEST_THRESHOLD / 10n ** 18n} GST. Propose deploying ${excessGST} GST surplus into yield strategies.`,
      params: {
        balanceWei:     treasury.balanceL1.toString(),
        thresholdWei:   ECONOMIC_POLICY.TREASURY_INVEST_THRESHOLD.toString(),
        investAmountWei: excessWei.toString(),
        chain:           "L1",
        chainId:          network.l1.chainId,
      },
      timestamp:            now,
      risk:                 "medium",
      requiresRatification: true,
      autoExecute:          false,
    });
  }

  // Propose buyback when treasury is below minimum floor
  if (
    treasury.balanceL1 > 0n &&
    treasury.balanceL1 < ECONOMIC_POLICY.TREASURY_MIN_BALANCE
  ) {
    proposals.push({
      id:          randomUUID(),
      type:        "treasury_buyback",
      description: `Treasury balance ${treasury.balanceL1 / 10n ** 18n} GST has fallen below minimum floor ${ECONOMIC_POLICY.TREASURY_MIN_BALANCE / 10n ** 18n} GST. Propose activating GST buyback to defend price floor.`,
      params: {
        balanceWei:   treasury.balanceL1.toString(),
        floorWei:     ECONOMIC_POLICY.TREASURY_MIN_BALANCE.toString(),
        deficitWei:   (ECONOMIC_POLICY.TREASURY_MIN_BALANCE - treasury.balanceL1).toString(),
        buybackTarget: treasury.nextBuybackThreshold.toString(),
        chain:         "L1",
        chainId:        network.l1.chainId,
      },
      timestamp:            now,
      risk:                 "high",
      requiresRatification: true,
      autoExecute:          false,
    });
  }

  return proposals;
}
