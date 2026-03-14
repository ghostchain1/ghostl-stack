/**
 * Validator Rewards Strategy
 *
 * Distributes a portion of gas revenue to active validators.
 * Called by the EconomyController on gas_revenue_spike events.
 */
import { TreasuryManager } from "../src/TreasuryManager";

export const VALIDATOR_REWARD_RATE = 0.40; // 40 % of gas revenue goes to validators

export async function validatorRewardsStrategy(
  gasRevenue: number,
  validatorAddresses: string[],
  treasury: TreasuryManager
): Promise<void> {
  const total = gasRevenue * VALIDATOR_REWARD_RATE;
  const perValidator = total / Math.max(validatorAddresses.length, 1);

  for (const addr of validatorAddresses) {
    treasury.allocate(
      addr,
      perValidator,
      "validator_reward",
    );
    console.log(`[Strategy:ValidatorRewards] ${perValidator.toFixed(4)} GST → ${addr}`);
  }
}
