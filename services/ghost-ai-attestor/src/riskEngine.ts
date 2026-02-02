import { getAddress, keccak256, solidityPacked, toUtf8Bytes } from "ethers";
import type { GhostLayer } from "./attestation.js";

export type RiskRequest = {
  subject: string;
  layer: GhostLayer;
  modelVersion: number;
  input?: unknown;
};

export type RiskResult = {
  subject: string;
  layer: GhostLayer;
  modelVersion: number;
  riskScoreBps: number;
  confidence: number;
  inputHash: string;
  outputHash: string;
  inputCanonical: string;
  outputCanonical: string;
};

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

const stableStringify = (value: unknown): string => {
  const normalize = (input: unknown): JsonLike => {
    if (input === null || typeof input === "boolean" || typeof input === "string") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input)) return String(input);
      return input;
    }
    if (Array.isArray(input)) return input.map((item) => normalize(item));
    if (typeof input === "object" && input) {
      const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      const result: Record<string, JsonLike> = {};
      entries.forEach(([key, val]) => {
        result[key] = normalize(val);
      });
      return result;
    }
    return String(input);
  };

  return JSON.stringify(normalize(value));
};

const hashString = (value: string): string => keccak256(toUtf8Bytes(value));

const toNumberInRange = (value: bigint, mod: bigint): number => {
  const bounded = value % mod;
  return Number(bounded);
};

export const computeRisk = (request: RiskRequest): RiskResult => {
  const subject = getAddress(request.subject);
  const layer = request.layer;
  const modelVersion = Math.max(1, Math.floor(request.modelVersion));

  const inputCanonical = stableStringify({
    subject,
    layer,
    modelVersion,
    input: request.input ?? null
  });
  const inputHash = hashString(inputCanonical);

  const baseSeedHex = keccak256(solidityPacked(["address", "uint8", "bytes32"], [subject, layer, inputHash]));
  const baseSeed = BigInt(baseSeedHex);

  const riskScoreBps = toNumberInRange(baseSeed, 10_001n);
  const confidence = 60 + toNumberInRange(baseSeed >> 32n, 41n);

  const outputCanonical = stableStringify({
    subject,
    layer,
    modelVersion,
    riskScoreBps,
    confidence
  });
  const outputHash = hashString(outputCanonical);

  return {
    subject,
    layer,
    modelVersion,
    riskScoreBps,
    confidence,
    inputHash,
    outputHash,
    inputCanonical,
    outputCanonical
  };
};

