import crypto from "node:crypto";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashInt = (seed, mod) => {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  const raw = BigInt(`0x${digest}`);
  return Number(raw % BigInt(mod));
};

const canonical = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const strategyTemplates = [
  { strategyId: "stable-core", stableRatioBps: 8000, baseApyBps: 420, baseRiskBps: 2200, concentrationBps: 1800 },
  { strategyId: "balanced-core", stableRatioBps: 6200, baseApyBps: 680, baseRiskBps: 3600, concentrationBps: 2600 },
  { strategyId: "yield-growth", stableRatioBps: 3500, baseApyBps: 1020, baseRiskBps: 5400, concentrationBps: 4200 },
  { strategyId: "defensive-liquidity", stableRatioBps: 9000, baseApyBps: 350, baseRiskBps: 1700, concentrationBps: 1400 }
];

const volatilityPenalty = (band) => {
  const normalized = String(band || "medium").toLowerCase();
  if (normalized === "high") return 900;
  if (normalized === "low") return 200;
  return 500;
};

export function buildRankedStrategies(input) {
  const volatilityBand = String(input?.volatilityBand || "medium").toLowerCase();
  const riskCapBps = Number(input?.riskCapBps || 7200);
  const maxProtocolConcentrationBps = Number(input?.maxProtocolConcentrationBps || 4500);
  const policyVersion = String(input?.policyVersion || "federation-v1");
  const treasuryValueWei = BigInt(String(input?.treasury?.totalValueWei || "0"));
  const deployedWei = BigInt(String(input?.treasury?.deployedCapitalWei || "0"));
  const availableWei = treasuryValueWei > deployedWei ? treasuryValueWei - deployedWei : 0n;

  const seedRoot = canonical({
    treasuryValueWei: treasuryValueWei.toString(),
    deployedWei: deployedWei.toString(),
    availableWei: availableWei.toString(),
    volatilityBand,
    riskCapBps,
    maxProtocolConcentrationBps,
    policyVersion
  });

  const architectCandidates = strategyTemplates.map((template) => ({
    ...template,
    proposalAllocationWei: ((availableWei * BigInt(2500 + hashInt(`${seedRoot}:${template.strategyId}:allocation`, 5000))) / 10_000n).toString()
  }));

  const riskAnalyst = architectCandidates.map((candidate) => {
    const randomOffset = hashInt(`${seedRoot}:${candidate.strategyId}:risk`, 950);
    const concentrationJitter = hashInt(`${seedRoot}:${candidate.strategyId}:conc`, 700);
    const riskScoreBps = clamp(candidate.baseRiskBps + volatilityPenalty(volatilityBand) + randomOffset, 500, 9900);
    const protocolConcentrationBps = clamp(candidate.concentrationBps + concentrationJitter, 300, 9500);
    const apySpread = 60 + hashInt(`${seedRoot}:${candidate.strategyId}:apy`, 220);
    const expectedApyCenter = Math.max(100, candidate.baseApyBps + hashInt(`${seedRoot}:${candidate.strategyId}:apycenter`, 180));
    const expectedApyRangeBps = {
      min: Math.max(50, expectedApyCenter - apySpread),
      max: expectedApyCenter + apySpread
    };
    const worstCaseDrawdownBps = clamp(Math.floor(riskScoreBps * 0.72), 200, 9600);
    return {
      ...candidate,
      riskScoreBps,
      protocolConcentrationBps,
      expectedApyRangeBps,
      worstCaseDrawdownBps
    };
  });

  const auditorReviewed = riskAnalyst.map((candidate) => {
    const policyViolations = [];
    if (candidate.riskScoreBps > riskCapBps) policyViolations.push("risk_cap_exceeded");
    if (candidate.protocolConcentrationBps > maxProtocolConcentrationBps) {
      policyViolations.push("protocol_concentration_exceeded");
    }
    if (candidate.worstCaseDrawdownBps > 9000) policyViolations.push("drawdown_breach");

    const reasonCodes = [
      `policy:${policyVersion}`,
      `volatility:${volatilityBand}`,
      `stable_ratio_bps:${candidate.stableRatioBps}`,
      `risk_score_bps:${candidate.riskScoreBps}`
    ];

    if (policyViolations.length === 0) reasonCodes.push("policy:pass");
    return {
      ...candidate,
      policyViolations,
      reasonCodes
    };
  });

  const governorRanked = auditorReviewed
    .map((candidate) => {
      const apyMid = (candidate.expectedApyRangeBps.min + candidate.expectedApyRangeBps.max) / 2;
      const violationPenalty = candidate.policyViolations.length * 2500;
      const riskPenalty = candidate.riskScoreBps * 0.45;
      const drawdownPenalty = candidate.worstCaseDrawdownBps * 0.2;
      const concentrationPenalty = candidate.protocolConcentrationBps * 0.08;
      const score = Number((apyMid * 10 - riskPenalty - drawdownPenalty - concentrationPenalty - violationPenalty).toFixed(2));
      return {
        strategyId: candidate.strategyId,
        score,
        expectedApyRangeBps: candidate.expectedApyRangeBps,
        worstCaseDrawdownBps: candidate.worstCaseDrawdownBps,
        riskScoreBps: candidate.riskScoreBps,
        protocolConcentrationBps: candidate.protocolConcentrationBps,
        policyViolations: candidate.policyViolations,
        reasonCodes: candidate.reasonCodes,
        projectedAllocationWei: candidate.proposalAllocationWei
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.strategyId.localeCompare(b.strategyId);
    })
    .map((strategy, index) => ({ ...strategy, rank: index + 1 }));

  const summary = {
    strategyCount: governorRanked.length,
    violations: governorRanked.reduce((sum, strategy) => sum + strategy.policyViolations.length, 0),
    topStrategyId: governorRanked[0]?.strategyId || null,
    policyVersion,
    volatilityBand,
    riskCapBps,
    maxProtocolConcentrationBps
  };

  return {
    summary,
    strategies: governorRanked
  };
}
