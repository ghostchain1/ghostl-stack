import { hashHex } from "./determinism/canonical.js";

export type PolicyConfig = {
  policyVersion: string;
  modelHash: string;
  maxGasLimit: number;
  maxFeePerGas: bigint;
  riskPenaltyBps: number;
  allowlistedContracts: Set<string>;
  denylistedContracts: Set<string>;
  sanctionAddresses: Set<string>;
  exploitSelectors: Set<string>;
  policyHash: string;
};

const parseCsv = (value: string | undefined): string[] => {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const parseBigInt = (value: string | undefined, fallback: bigint): bigint => {
  if (!value) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
};

const parseIntSafe = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const loadPolicyConfig = (): PolicyConfig => {
  const policyVersion = process.env.POLICY_VERSION || "ghost-policy-v1";
  const modelHash = process.env.MODEL_HASH || "sha256:ghost-ai-deterministic-v1";
  const maxGasLimit = parseIntSafe(process.env.POLICY_MAX_GAS_LIMIT, 30_000_000);
  const maxFeePerGas = parseBigInt(process.env.POLICY_MAX_FEE_PER_GAS, 120_000_000_000n);
  const riskPenaltyBps = parseIntSafe(process.env.POLICY_RISK_PENALTY_BPS, 2_500);

  const allowlistedContracts = new Set(parseCsv(process.env.POLICY_ALLOWLIST));
  const denylistedContracts = new Set(parseCsv(process.env.POLICY_DENYLIST));
  const sanctionAddresses = new Set(parseCsv(process.env.POLICY_SANCTIONS));
  const exploitSelectors = new Set(parseCsv(process.env.POLICY_EXPLOIT_SELECTORS));

  const policyHash = hashHex({
    policyVersion,
    modelHash,
    maxGasLimit,
    maxFeePerGas: maxFeePerGas.toString(),
    riskPenaltyBps,
    allowlistedContracts: [...allowlistedContracts].sort(),
    denylistedContracts: [...denylistedContracts].sort(),
    sanctionAddresses: [...sanctionAddresses].sort(),
    exploitSelectors: [...exploitSelectors].sort()
  });

  return {
    policyVersion,
    modelHash,
    maxGasLimit,
    maxFeePerGas,
    riskPenaltyBps,
    allowlistedContracts,
    denylistedContracts,
    sanctionAddresses,
    exploitSelectors,
    policyHash
  };
};
