export type RiskInput = {
  actor: string;
  amountWei: bigint;
  nonce: bigint;
};

export function computeRiskScore(input: RiskInput): number {
  // MVP heuristic "AI":
  // - bigger amount => higher risk
  // - you can add velocity / frequency / address age later
  const eth = Number(input.amountWei) / 1e18;

  let score = 10;

  if (eth >= 1) score += 10;
  if (eth >= 10) score += 15;
  if (eth >= 50) score += 20;
  if (eth >= 100) score += 25;

  // cap 0..100
  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return score;
}
