import crypto from "node:crypto";
import { stableStringify } from "./merkle.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function deterministicRiskScore(input) {
  const digest = crypto.createHash("sha256").update(stableStringify(input)).digest("hex");
  const firstWord = parseInt(digest.slice(0, 8), 16);
  return firstWord % 10_000;
}

export function simulateAllocation({
  principalWei,
  stableAssetRatio,
  yieldRatio,
  riskCapBps,
  strategy = "balanced"
}) {
  const principal = BigInt(String(principalWei || "0"));
  if (principal <= 0n) {
    throw new Error("principal_must_be_positive");
  }

  const stableRatio = clamp(Number(stableAssetRatio), 0, 100);
  const yieldSideRatio = clamp(Number(yieldRatio), 0, 100);
  const ratioTotal = stableRatio + yieldSideRatio;
  if (ratioTotal <= 0) {
    throw new Error("allocation_ratio_must_be_positive");
  }

  const stableWei = (principal * BigInt(Math.round(stableRatio * 100))) / BigInt(Math.round(ratioTotal * 100));
  const yieldWei = principal - stableWei;

  const riskScoreBps = deterministicRiskScore({ principal: principal.toString(), stableRatio, yieldSideRatio, strategy });
  const expectedApyBps = clamp(Math.round(300 + (yieldSideRatio * 45) / 10 - riskScoreBps / 120), 50, 2600);

  return {
    strategy,
    principalWei: principal.toString(),
    split: {
      stableAssetWei: stableWei.toString(),
      yieldAssetWei: yieldWei.toString()
    },
    expectedApyBps,
    riskScoreBps,
    withinRiskCap: riskScoreBps <= Number(riskCapBps)
  };
}
