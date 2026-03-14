/**
 * Fee Manager
 *
 * Dynamically proposes gas fee adjustments based on observed L1/L2 gas prices.
 * All proposals require human ratification — no autonomous fee changes.
 *
 * Policy:
 *   - gasPrice > HIGH_GAS_GWEI → propose lowering network base fee
 *   - gasPrice < LOW_GAS_GWEI  → propose raising base fee to maintain validator income
 */
import { randomUUID } from "node:crypto";
import type { NetworkState, GovernorProposal } from "../types.js";

// Fee thresholds in Gwei (1 Gwei = 1e9 wei)
const GWEI = 1_000_000_000n;
const HIGH_GAS_GWEI = BigInt(process.env.FEE_HIGH_GAS_GWEI ?? "200") * GWEI;
const LOW_GAS_GWEI  = BigInt(process.env.FEE_LOW_GAS_GWEI  ??  "10") * GWEI;

export async function adjustFees(network: NetworkState): Promise<GovernorProposal[]> {
  const proposals: GovernorProposal[] = [];
  const now = Date.now();

  // L1 fee adjustment
  if (network.l1.reachable) {
    if (network.l1.gasPrice > HIGH_GAS_GWEI) {
      proposals.push({
        id:          randomUUID(),
        type:        "fee_adjustment",
        description: `L1 gas price ${network.l1.gasPrice / GWEI} Gwei exceeds ceiling ${HIGH_GAS_GWEI / GWEI} Gwei. Propose lowering base fee to improve transaction throughput.`,
        params: {
          chain:           "L1",
          chainId:         network.l1.chainId,
          currentGasGwei:  Number(network.l1.gasPrice / GWEI),
          proposedAction:  "lower_base_fee",
          targetGwei:      Number(HIGH_GAS_GWEI / GWEI / 2n),
        },
        timestamp:            now,
        risk:                 "low",
        requiresRatification: true,
        autoExecute:          false,
      });
    } else if (network.l1.gasPrice < LOW_GAS_GWEI && network.l1.gasPrice > 0n) {
      proposals.push({
        id:          randomUUID(),
        type:        "fee_adjustment",
        description: `L1 gas price ${network.l1.gasPrice / GWEI} Gwei below floor ${LOW_GAS_GWEI / GWEI} Gwei. Propose raising base fee to sustain validator income.`,
        params: {
          chain:           "L1",
          chainId:         network.l1.chainId,
          currentGasGwei:  Number(network.l1.gasPrice / GWEI),
          proposedAction:  "raise_base_fee",
          targetGwei:      Number(LOW_GAS_GWEI / GWEI),
        },
        timestamp:            now,
        risk:                 "low",
        requiresRatification: true,
        autoExecute:          false,
      });
    }
  }

  // L2 fee adjustment
  if (network.l2.reachable) {
    if (network.l2.gasPrice > HIGH_GAS_GWEI) {
      proposals.push({
        id:          randomUUID(),
        type:        "fee_adjustment",
        description: `L2 gas price ${network.l2.gasPrice / GWEI} Gwei exceeds ceiling. Propose lowering L2 sequencer fee.`,
        params: {
          chain:           "L2",
          chainId:         network.l2.chainId,
          currentGasGwei:  Number(network.l2.gasPrice / GWEI),
          proposedAction:  "lower_sequencer_fee",
          targetGwei:      Number(HIGH_GAS_GWEI / GWEI / 2n),
        },
        timestamp:            now,
        risk:                 "low",
        requiresRatification: true,
        autoExecute:          false,
      });
    }
  }

  return proposals;
}
