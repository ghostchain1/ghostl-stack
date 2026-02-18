import type { PolicyConfig } from "../config.js";
import { hashHex } from "../determinism/canonical.js";

export type TxCandidate = {
  txHash?: string;
  from?: string;
  to?: string;
  valueWei?: string;
  gasLimit?: number;
  maxFeePerGas?: string;
  data?: string;
  chainId?: number;
};

export type TxFeatures = {
  txHash: string;
  from: string;
  to: string;
  chainId: number;
  valueWei: bigint;
  gasLimit: number;
  maxFeePerGas: bigint;
  calldataBytes: number;
  selector: string;
  isAllowlisted: boolean;
  isDenylisted: boolean;
  isSanctioned: boolean;
  hasExploitSignature: boolean;
  featureVectorHash: string;
};

const normalizeAddress = (value: string | undefined): string => {
  return String(value || "0x0000000000000000000000000000000000000000").toLowerCase();
};

const normalizeHash = (value: string | undefined): string => {
  const source = String(value || "").toLowerCase();
  return source.startsWith("0x") ? source : hashHex(source);
};

const parseBigIntSafe = (value: string | undefined): bigint => {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const normalizeDataHex = (value: string | undefined): string => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.startsWith("0x")) return raw;
  if (!raw) return "0x";
  return `0x${raw}`;
};

export const extractFeatures = (tx: TxCandidate, policy: PolicyConfig): TxFeatures => {
  const from = normalizeAddress(tx.from);
  const to = normalizeAddress(tx.to);
  const data = normalizeDataHex(tx.data);

  const selector = data.length >= 10 ? data.slice(0, 10) : "0x00000000";
  const calldataBytes = data === "0x" ? 0 : Math.max(0, (data.length - 2) / 2);

  const features = {
    txHash: normalizeHash(tx.txHash),
    from,
    to,
    chainId: Number.isFinite(tx.chainId) ? Number(tx.chainId) : 0,
    valueWei: parseBigIntSafe(tx.valueWei),
    gasLimit: Number.isFinite(tx.gasLimit) ? Math.max(0, Number(tx.gasLimit)) : 0,
    maxFeePerGas: parseBigIntSafe(tx.maxFeePerGas),
    calldataBytes,
    selector,
    isAllowlisted: policy.allowlistedContracts.has(to),
    isDenylisted: policy.denylistedContracts.has(to),
    isSanctioned: policy.sanctionAddresses.has(from) || policy.sanctionAddresses.has(to),
    hasExploitSignature: policy.exploitSelectors.has(selector)
  };

  return {
    ...features,
    featureVectorHash: hashHex({
      ...features,
      valueWei: features.valueWei.toString(),
      maxFeePerGas: features.maxFeePerGas.toString()
    })
  };
};
