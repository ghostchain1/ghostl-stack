import fs from 'node:fs';
import path from 'node:path';
import { ghost } from 'ghost';

export type EvidenceBundle = {
  version: string;
  kind: string;
  chainKey: string;
  chainId: number;
  policyKey: string;
  policyValue: string;
  emergency: boolean;
  issuedAt: string;
  source: string;
  policyCheckpoint?: {
    hash: string;
    layer: string;
    registryAddress?: string | null;
    capturedAt?: string;
  } | null;
  explainability: {
    rationale: string;
    assumptions: string[];
    expectedImpact: string;
    rollbackPlan: string;
    confidence: number;
    modelVersion?: string | null;
  };
  metadata: Record<string, unknown>;
  simulation?: Record<string, unknown> | null;
  prediction?: Record<string, unknown> | null;
  inputsHash: string;
};

export const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashJson = (value: unknown): string => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

export const buildEvidenceBundle = (input: {
  kind: string;
  chainKey: string;
  chainId: number;
  policyKey: string;
  policyValue: string;
  emergency: boolean;
  issuedAt: string;
  source: string;
  policyCheckpoint?: EvidenceBundle['policyCheckpoint'];
  explainability: EvidenceBundle["explainability"];
  metadata?: Record<string, unknown>;
  simulation?: Record<string, unknown> | null;
  prediction?: Record<string, unknown> | null;
}) => {
  const metadata = input.metadata ?? {};
  const explainability = input.explainability;
  const policyCheckpoint = input.policyCheckpoint ?? null;
  const inputsHash = hashJson({
    explainability,
    metadata,
    simulation: input.simulation ?? null,
    prediction: input.prediction ?? null,
    policyCheckpoint
  });
  const bundle: EvidenceBundle = {
    version: '2',
    kind: input.kind,
    chainKey: input.chainKey,
    chainId: input.chainId,
    policyKey: input.policyKey,
    policyValue: input.policyValue,
    emergency: input.emergency,
    issuedAt: input.issuedAt,
    source: input.source,
    ...(policyCheckpoint ? { policyCheckpoint } : {}),
    explainability,
    metadata,
    simulation: input.simulation ?? null,
    prediction: input.prediction ?? null,
    inputsHash
  };
  const evidenceHash = hashJson(bundle);
  const metadataHash = hashJson(metadata);
  return { bundle, evidenceHash, metadataHash };
};

export const writeEvidenceBundle = (
  bundle: EvidenceBundle,
  evidenceHash: string,
  outputDir?: string | null
) => {
  if (!outputDir) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `evidence-${bundle.chainKey}-${evidenceHash}.json`);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf8');
  return filePath;
};

const POLICY_REGISTRY_ABI = [
  'function getPolicy(bytes32) view returns (tuple(uint256 value,uint32 version,uint64 updatedAt,bytes32 evidenceHash), tuple(uint256 value,uint64 activatesAt,bytes32 evidenceHash,bool exists), tuple(uint256 value,uint64 expiresAt,bytes32 evidenceHash,bool active))'
];

export const fetchPolicyVersion = async (rpcUrl: string, registryAddress: string, policyKey: string) => {
  const provider = new ghost.JsonRpcProvider(rpcUrl);
  const registry = new ghost.Contract(registryAddress, POLICY_REGISTRY_ABI, provider);
  const result = await registry.getPolicy(policyKey);
  const current = result?.[0] || {};
  const version = Number(current.version ?? current[1] ?? 0);
  return Number.isFinite(version) ? version : 0;
};

const EVIDENCE_VAULT_ABI = [
  'function recordEvidence(bytes32 kind,bytes32 evidenceHash,bytes32 policyKey,uint32 policyVersion,uint256 proposalId,bytes32 signerSetHash,uint16 threshold,bytes32 metadataHash) returns (bytes32)'
];

const toBytes32 = (value: string) => {
  if (ghost.isHexString(value, 32)) return value;
  return ghost.keccak256(ghost.toUtf8Bytes(value));
};

export const recordEvidence = async (input: {
  vaultAddress: string;
  rpcUrl: string;
  submitterKey: string;
  kind: string;
  evidenceHash: string;
  policyKey: string;
  policyVersion: number;
  proposalId: number;
  signerSetHash: string;
  threshold: number;
  metadataHash: string;
}) => {
  const provider = new ghost.JsonRpcProvider(input.rpcUrl);
  const wallet = new ghost.Wallet(input.submitterKey, provider);
  const vault = new ghost.Contract(input.vaultAddress, EVIDENCE_VAULT_ABI, wallet);
  const tx = await vault.recordEvidence(
    toBytes32(input.kind),
    input.evidenceHash,
    input.policyKey,
    input.policyVersion,
    input.proposalId,
    toBytes32(input.signerSetHash),
    input.threshold,
    input.metadataHash
  );
  const receipt = await tx.wait();
  return { txHash: tx.hash, blockNumber: receipt?.blockNumber ?? null };
};
