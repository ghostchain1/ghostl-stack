/**
 * Token Burn Strategy
 *
 * Burns excess GST supply to maintain deflationary pressure.
 * Triggered by TokenomicsEngine when the supply ratio exceeds target.
 */
import { TreasuryManager } from "../src/TreasuryManager";

export async function tokenBurnStrategy(
  burnAmount: number,
  treasury: TreasuryManager
): Promise<void> {
  if (burnAmount <= 0) return;

  // In production this would call ghost_burnTokens on-chain.
  // Here we record the intent via treasury allocation to the burn address.
  treasury.allocate(
    "0x000000000000000000000000000000000000dEaD",
    burnAmount,
    "token_burn",
  );

  console.log(`[Strategy:TokenBurn] Burned ${burnAmount} GST (sent to 0xdEaD)`);
}
