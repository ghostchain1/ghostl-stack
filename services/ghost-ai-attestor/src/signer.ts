import {
  Wallet,
  getAddress,
  isHexString,
  keccak256,
  toUtf8Bytes,
  type Provider
} from "ghost";
import {
  buildGhostAIDomain,
  normalizeAttestation,
  signAttestation,
  type AIAttestationPayload,
  type GhostLayer,
  type SignedAIAttestation
} from "./attestation.js";
import type { RiskResult } from "./riskEngine.js";

export type AttestationBuildParams = {
  subject: string;
  layer: GhostLayer;
  chainId: bigint;
  hubAddress: string;
  risk: RiskResult;
  ttlSeconds: number;
  nonce: bigint;
  modelVersion: number;
  modelCardHash?: string;
  explanationRef?: string;
  nowSeconds?: number;
};

const toBytes32Ref = (value: string | undefined, fallbackSeed: string): string => {
  if (value && isHexString(value, 32)) {
    return value;
  }
  if (value && value.startsWith("0x") && !isHexString(value, 32)) {
    throw new Error(`expected bytes32 hex value, got: ${value}`);
  }
  const seed = value?.trim() ? value.trim() : fallbackSeed;
  return keccak256(toUtf8Bytes(seed));
};

export const createWallet = (privateKey: string, provider: Provider): Wallet => {
  if (!privateKey) {
    throw new Error("AI_ATTESTOR_PRIVATE_KEY is required for signing");
  }
  return new Wallet(privateKey, provider);
};

export const buildAttestationPayload = (params: AttestationBuildParams): AIAttestationPayload => {
  const issuedAt = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.max(1, Math.floor(params.ttlSeconds));
  const subject = getAddress(params.subject);
  const layer = params.layer;

  const modelVersion = Math.max(1, Math.floor(params.modelVersion));

  const modelCardHash = toBytes32Ref(
    params.modelCardHash,
    `ghostai:model-card:v${modelVersion}`
  );
  const explanationRef = toBytes32Ref(
    params.explanationRef,
    `ghostai:explanation:${subject.toLowerCase()}:layer:${layer}:risk:${params.risk.riskScoreBps}`
  );

  return normalizeAttestation({
    issuedAt,
    expiresAt,
    modelVersion,
    modelCardHash,
    inputHash: params.risk.inputHash,
    outputHash: params.risk.outputHash,
    riskScoreBps: params.risk.riskScoreBps,
    confidence: params.risk.confidence,
    subject,
    nonce: params.nonce,
    layer,
    explanationRef
  });
};

export const signWithWallet = async (
  wallet: Wallet,
  params: AttestationBuildParams
): Promise<SignedAIAttestation> => {
  const domain = buildGhostAIDomain(params.chainId, params.hubAddress);
  const payload = buildAttestationPayload(params);
  return signAttestation(wallet, domain, payload);
};

