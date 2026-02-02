import {
  AbiCoder,
  TypedDataEncoder,
  getAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
  type BytesLike,
  type Signer,
  type TypedDataField
} from "ethers";

export const GHOST_AI_DOMAIN_NAME = "GhostAI";
export const GHOST_AI_DOMAIN_VERSION = "1";

export const EIP712_DOMAIN_TYPESTRING = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
export const AI_ATTESTATION_TYPESTRING =
  "AIAttestation(bytes32 attestationId,uint256 issuedAt,uint256 expiresAt,uint32 modelVersion,bytes32 modelCardHash,bytes32 inputHash,bytes32 outputHash,uint16 riskScoreBps,uint8 confidence,address subject,uint256 nonce,uint8 layer,bytes32 explanationRef)";

export const EIP712_DOMAIN_TYPEHASH = keccak256(toUtf8Bytes(EIP712_DOMAIN_TYPESTRING));
export const AI_ATTESTATION_TYPEHASH = keccak256(toUtf8Bytes(AI_ATTESTATION_TYPESTRING));

export type GhostLayer = 1 | 2 | 3;

export interface AIAttestationDomain {
  name: string;
  version: string;
  chainId: bigint | number;
  verifyingContract: string;
}

export interface AIAttestation {
  attestationId: string;
  issuedAt: bigint | number;
  expiresAt: bigint | number;
  modelVersion: bigint | number;
  modelCardHash: BytesLike;
  inputHash: BytesLike;
  outputHash: BytesLike;
  riskScoreBps: bigint | number;
  confidence: bigint | number;
  subject: string;
  nonce: bigint | number;
  layer: GhostLayer;
  explanationRef: BytesLike;
}

export type AIAttestationPayload = Omit<AIAttestation, "attestationId"> & { attestationId?: string };

export interface SignedAIAttestation {
  domain: AIAttestationDomain;
  domainSeparator: string;
  attestation: AIAttestation;
  structHash: string;
  digest: string;
  signature: string;
  signer: string;
}

export interface NonceManager {
  nextNonce(address: string): bigint;
  peekNonce(address: string): bigint;
  setNonce(address: string, value: bigint | number | string): void;
}

const abiCoder = AbiCoder.defaultAbiCoder();

const AI_ATTESTATION_EIP712_TYPES: Record<string, TypedDataField[]> = {
  AIAttestation: [
    { name: "attestationId", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "modelVersion", type: "uint32" },
    { name: "modelCardHash", type: "bytes32" },
    { name: "inputHash", type: "bytes32" },
    { name: "outputHash", type: "bytes32" },
    { name: "riskScoreBps", type: "uint16" },
    { name: "confidence", type: "uint8" },
    { name: "subject", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "layer", type: "uint8" },
    { name: "explanationRef", type: "bytes32" }
  ]
};

const ATTESTATION_ID_TYPES = [
  "uint256",
  "uint256",
  "uint32",
  "bytes32",
  "bytes32",
  "bytes32",
  "uint16",
  "uint8",
  "address",
  "uint256",
  "uint8",
  "bytes32"
] as const;

const toBigInt = (value: bigint | number | string): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  return BigInt(value);
};

const normalizeDomain = (domain: AIAttestationDomain): AIAttestationDomain => {
  return {
    name: domain.name,
    version: domain.version,
    chainId: toBigInt(domain.chainId),
    verifyingContract: getAddress(domain.verifyingContract)
  };
};

const assertLayer = (layer: number): GhostLayer => {
  if (layer === 1 || layer === 2 || layer === 3) return layer;
  throw new Error(`invalid layer: ${layer}`);
};

const assertBps = (value: bigint | number, label: string, max: number): void => {
  const numeric = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be finite`);
  }
  if (numeric < 0 || numeric > max) {
    throw new Error(`${label} out of range: ${numeric}`);
  }
};

export function buildGhostAIDomain(chainId: bigint | number, verifyingContract: string): AIAttestationDomain {
  return normalizeDomain({
    name: GHOST_AI_DOMAIN_NAME,
    version: GHOST_AI_DOMAIN_VERSION,
    chainId,
    verifyingContract
  });
}

export function computeDomainSeparator(domain: AIAttestationDomain): string {
  const normalized = normalizeDomain(domain);
  return TypedDataEncoder.hashDomain(normalized);
}

type NormalizedAttestationCore = Omit<AIAttestation, "attestationId">;

const normalizeAttestationCore = (payload: AIAttestationPayload): NormalizedAttestationCore => {
  const issuedAt = toBigInt(payload.issuedAt);
  const expiresAt = toBigInt(payload.expiresAt);
  const modelVersion = toBigInt(payload.modelVersion);
  const riskScoreBps = toBigInt(payload.riskScoreBps);
  const confidence = toBigInt(payload.confidence);
  const nonce = toBigInt(payload.nonce);
  const layer = assertLayer(payload.layer);

  assertBps(riskScoreBps, "riskScoreBps", 10_000);
  assertBps(confidence, "confidence", 100);

  if (expiresAt < issuedAt) {
    throw new Error(`expiresAt before issuedAt: ${expiresAt} < ${issuedAt}`);
  }

  return {
    issuedAt,
    expiresAt,
    modelVersion,
    modelCardHash: payload.modelCardHash,
    inputHash: payload.inputHash,
    outputHash: payload.outputHash,
    riskScoreBps,
    confidence,
    subject: getAddress(payload.subject),
    nonce,
    layer,
    explanationRef: payload.explanationRef
  };
};

const computeAttestationIdFromCore = (core: NormalizedAttestationCore): string => {
  const encoded = abiCoder.encode(ATTESTATION_ID_TYPES, [
    core.issuedAt,
    core.expiresAt,
    core.modelVersion,
    core.modelCardHash,
    core.inputHash,
    core.outputHash,
    core.riskScoreBps,
    core.confidence,
    core.subject,
    core.nonce,
    core.layer,
    core.explanationRef
  ]);
  return keccak256(encoded);
};

export function computeAttestationId(payload: AIAttestationPayload): string {
  const core = normalizeAttestationCore(payload);
  return computeAttestationIdFromCore(core);
}

export function normalizeAttestation(payload: AIAttestationPayload): AIAttestation {
  const core = normalizeAttestationCore(payload);
  const computedId = computeAttestationIdFromCore(core);
  if (payload.attestationId && String(payload.attestationId).toLowerCase() !== computedId.toLowerCase()) {
    throw new Error(`attestationId mismatch: provided=${payload.attestationId} computed=${computedId}`);
  }
  return { attestationId: computedId, ...core };
}

export function computeStructHash(attestation: AIAttestationPayload): string {
  const normalized = normalizeAttestation(attestation);
  return TypedDataEncoder.hashStruct("AIAttestation", AI_ATTESTATION_EIP712_TYPES, normalized);
}

export function computeAttestationDigest(domain: AIAttestationDomain, attestation: AIAttestationPayload): string {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedAttestation = normalizeAttestation(attestation);
  return TypedDataEncoder.hash(normalizedDomain, AI_ATTESTATION_EIP712_TYPES, normalizedAttestation);
}

export async function signAttestation(
  signer: Signer,
  domain: AIAttestationDomain,
  payload: AIAttestationPayload
): Promise<SignedAIAttestation> {
  if (typeof (signer as Signer & { signTypedData?: unknown }).signTypedData !== "function") {
    throw new Error("signer does not support signTypedData");
  }

  const normalizedDomain = normalizeDomain(domain);
  const normalizedAttestation = normalizeAttestation(payload);

  const signature = await signer.signTypedData(normalizedDomain, AI_ATTESTATION_EIP712_TYPES, normalizedAttestation);
  const signerAddress = await signer.getAddress();

  return {
    domain: normalizedDomain,
    domainSeparator: computeDomainSeparator(normalizedDomain),
    attestation: normalizedAttestation,
    structHash: computeStructHash(normalizedAttestation),
    digest: computeAttestationDigest(normalizedDomain, normalizedAttestation),
    signature,
    signer: getAddress(signerAddress)
  };
}

export function verifyAttestationSignature(
  domain: AIAttestationDomain,
  attestation: AIAttestationPayload,
  signature: string,
  expectedSigner?: string
): { valid: boolean; recovered: string } {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedAttestation = normalizeAttestation(attestation);
  const recovered = getAddress(
    verifyTypedData(normalizedDomain, AI_ATTESTATION_EIP712_TYPES, normalizedAttestation, signature)
  );
  if (!expectedSigner) {
    return { valid: true, recovered };
  }
  return { valid: recovered === getAddress(expectedSigner), recovered };
}

export function createNonceManager(initialNonces?: Record<string, bigint | number | string>): NonceManager {
  const store = new Map<string, bigint>();
  if (initialNonces) {
    Object.entries(initialNonces).forEach(([address, value]) => {
      store.set(getAddress(address), toBigInt(value));
    });
  }

  const peekNonce = (address: string): bigint => {
    const key = getAddress(address);
    return store.get(key) ?? 0n;
  };

  const setNonce = (address: string, value: bigint | number | string): void => {
    const key = getAddress(address);
    store.set(key, toBigInt(value));
  };

  const nextNonce = (address: string): bigint => {
    const key = getAddress(address);
    const current = store.get(key) ?? 0n;
    const next = current + 1n;
    store.set(key, next);
    return current;
  };

  return { nextNonce, peekNonce, setNonce };
}

export const GHOST_AI_GOLDEN_VECTOR = {
  domain: buildGhostAIDomain(901n, "0x1111111111111111111111111111111111111111"),
  attestation: {
    attestationId: "0x91444930e049cc24ddd8ef8fe22a135eae718a0d97b7d4eafd2a064fb73128a8",
    issuedAt: 1_700_000_000n,
    expiresAt: 1_700_003_600n,
    modelVersion: 1n,
    modelCardHash: "0xffbafac33bae212e532270a7a92fcf337d4b6b0dd8eadbd50f1161d1096d214f",
    inputHash: "0x94c58e36f93af84b7aaa6f1f298e1f17719ac0f716089415dd7b0fc52462140b",
    outputHash: "0xdf2e094cda4de966de648b49bb33e4cc78940d8747c74548217090b9a507ce9f",
    riskScoreBps: 4_200n,
    confidence: 90n,
    subject: "0x2222222222222222222222222222222222222222",
    nonce: 7n,
    layer: 2 as GhostLayer,
    explanationRef: "0x25f17a5547d007cc33c05585a1b4bc36de866223ffbce942244767c2d4e13ecd"
  },
  expected: {
    domainSeparator: "0xece9faf26844d24ba605c423fcaafd1f9da86be06897d04c7a0587c525ab7270",
    structHash: "0x11e900b3d487b3a8642f217ce5fa6c7db6835e688bf289a0e9883d13159df1c2",
    digest: "0xce5daddbf1875a95c4e3a1f901469d3ab824a502ff53f02a33e6b11a1eee6282",
    attestationId: "0x91444930e049cc24ddd8ef8fe22a135eae718a0d97b7d4eafd2a064fb73128a8",
    domainTypehash: "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f",
    attestationTypehash: "0xd1d84c36dfff363e325c2bd313abc2468440fe41ddf182f05e52da294beaf710"
  }
} as const;

export const GHOST_AI_TYPES = AI_ATTESTATION_EIP712_TYPES;
