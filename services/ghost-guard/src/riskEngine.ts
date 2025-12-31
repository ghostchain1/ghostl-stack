export type RiskInput = {
  actor: string;
  amountWei: bigint;
  nonce: bigint;
};

export function computeRiskScore(input: RiskInput): number {
  // MVP heuristic "AI":
  // - bigger amount => higher risk
  // - you can add velocity / frequency / address age later
  let score = 10;

  // Avoid `Number(bigint)` which can throw for large values (uint256).
  const oneEth = 1_000_000_000_000_000_000n;
  const tenEth = 10n * oneEth;
  const fiftyEth = 50n * oneEth;
  const hundredEth = 100n * oneEth;

  if (input.amountWei >= oneEth) score += 10;
  if (input.amountWei >= tenEth) score += 15;
  if (input.amountWei >= fiftyEth) score += 20;
  if (input.amountWei >= hundredEth) score += 25;

  // cap 0..100
  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return score;
}
