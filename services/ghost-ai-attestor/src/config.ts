import "dotenv/config";
import { getAddress, isAddress } from "@ghostchain/sdk";

export type GhostLayer = 1 | 2 | 3;

export type LayerConfig = {
  layer: GhostLayer;
  rpcUrl: string;
  registryAddress: string;
  hubAddress: string;
};

export type AttestorConfig = {
  port: number;
  defaultLayer: GhostLayer;
  layers: Record<GhostLayer, LayerConfig>;
  privateKey: string;
  apiKey?: string;
  modelVersion: number;
  ttlSeconds: number;
  nonceStorePath: string;
  corsAllowedOrigins: string[];
  minAttestIntervalSeconds: number;
  allowInsecureDev: boolean;
};

const DEFAULT_RPC_URLS: Record<GhostLayer, string> = {
  1: "http://localhost:18545",
  2: "http://localhost:7260",
  3: "http://localhost:7270"
};

const toPositiveInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const toLayer = (raw: string | undefined, fallback: GhostLayer): GhostLayer => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  return fallback;
};

const normalizeAddress = (raw: string | undefined): string => {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!isAddress(trimmed)) {
    throw new Error(`invalid address: ${trimmed}`);
  }
  return getAddress(trimmed);
};

const readRpcUrl = (layer: GhostLayer): string => {
  const keyed = process.env[`RPC_URL_L${layer}` as const];
  const legacy = process.env[`RPC_L${layer}` as const];
  return keyed || legacy || DEFAULT_RPC_URLS[layer];
};

const readLayerConfig = (layer: GhostLayer): LayerConfig => {
  const registryAddress = normalizeAddress(process.env[`AI_ORACLE_REGISTRY_ADDRESS_L${layer}` as const]);
  const hubAddress = normalizeAddress(process.env[`AI_ATTESTATION_HUB_ADDRESS_L${layer}` as const]);
  return {
    layer,
    rpcUrl: readRpcUrl(layer),
    registryAddress,
    hubAddress
  };
};

const parseOrigins = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

export const POLICY_KEYS = {
  riskThresholdBps: "ghostai.policy.risk.threshold.bps",
  minConfidence: "ghostai.policy.min.confidence",
  maxAttestationAge: "ghostai.policy.max.attestation.age"
} as const;

export const loadConfig = (): AttestorConfig => {
  const port = toPositiveInt(process.env.PORT, 3310);
  const defaultLayer = toLayer(process.env.AI_LAYER_DEFAULT, 2);

  const layers: Record<GhostLayer, LayerConfig> = {
    1: readLayerConfig(1),
    2: readLayerConfig(2),
    3: readLayerConfig(3)
  };

  return {
    port,
    defaultLayer,
    layers,
    privateKey: (process.env.AI_ATTESTOR_PRIVATE_KEY || "").trim(),
    apiKey: (process.env.AI_ATTESTOR_API_KEY || "").trim() || undefined,
    modelVersion: toPositiveInt(process.env.AI_MODEL_VERSION, 1),
    ttlSeconds: toPositiveInt(process.env.AI_ATTESTATION_TTL_SECONDS, 3600),
    nonceStorePath: (process.env.AI_NONCE_STORE_PATH || "/data/ai-attestor-nonces.json").trim(),
    corsAllowedOrigins: parseOrigins(process.env.AI_CORS_ALLOWED_ORIGINS),
    minAttestIntervalSeconds: toPositiveInt(process.env.AI_MIN_ATTEST_INTERVAL_SECONDS, 15),
    allowInsecureDev: (process.env.AI_ALLOW_INSECURE_DEV || "true").toLowerCase() !== "false"
  };
};
