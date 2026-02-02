import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
  keccak256,
  toUtf8Bytes,
  type InterfaceAbi
} from "ethers";
import type { AIAttestation, GhostLayer } from "./attestation.js";
import { POLICY_KEYS, type LayerConfig } from "./config.js";

const HUB_ABI = [
  "function submitAttestation((bytes32 attestationId,uint256 issuedAt,uint256 expiresAt,uint32 modelVersion,bytes32 modelCardHash,bytes32 inputHash,bytes32 outputHash,uint16 riskScoreBps,uint8 confidence,address subject,uint256 nonce,uint8 layer,bytes32 explanationRef) attestation, bytes signature) returns (bytes32)",
  "function nonces(address signer) view returns (uint256)",
  "function getLatestRisk(address subject, uint8 layer) view returns (uint16 riskScoreBps, uint8 confidence, bytes32 attestationId, uint256 issuedAt, uint256 expiresAt)",
  "function layerId() view returns (uint8)"
] as const satisfies InterfaceAbi;

const REGISTRY_ABI = [
  "function isSignerAllowed(address signer) view returns (bool)",
  "function getSignerInfo(address signer) view returns (bool allowed,uint32 signerType,string metadataURI,uint64 addedAt,uint64 disabledAt,uint64 updatedAt)",
  "function getPolicy(bytes32 key) view returns (uint256)"
] as const satisfies InterfaceAbi;

export type PolicySnapshot = {
  riskThresholdBps: number;
  minConfidence: number;
  maxAttestationAgeSeconds: number;
};

export type LatestRiskSnapshot = {
  riskScoreBps: number;
  confidence: number;
  attestationId: string;
  issuedAt: number;
  expiresAt: number;
};

const policyKey = (label: string): string => keccak256(toUtf8Bytes(label));

export class HubClient {
  readonly layer: GhostLayer;
  readonly provider: JsonRpcProvider;
  readonly wallet: Wallet | null;
  readonly hubAddress: string;
  readonly registryAddress: string;

  private hub: Contract | null = null;
  private registry: Contract | null = null;
  private chainIdCache: bigint | null = null;
  private layerIdCache: GhostLayer | null = null;

  constructor(layerConfig: LayerConfig, privateKey: string) {
    this.layer = layerConfig.layer;
    this.provider = new JsonRpcProvider(layerConfig.rpcUrl, undefined, { polling: true });
    this.provider.pollingInterval = 1000;
    this.wallet = privateKey ? new Wallet(privateKey, this.provider) : null;
    this.hubAddress = layerConfig.hubAddress ? getAddress(layerConfig.hubAddress) : "";
    this.registryAddress = layerConfig.registryAddress ? getAddress(layerConfig.registryAddress) : "";
  }

  private ensureHub(): Contract {
    if (!this.hubAddress) {
      throw new Error(`missing hub address for layer ${this.layer}`);
    }
    if (!this.hub) {
      this.hub = new Contract(this.hubAddress, HUB_ABI, this.wallet ?? this.provider);
    }
    return this.hub;
  }

  private ensureRegistry(): Contract {
    if (!this.registryAddress) {
      throw new Error(`missing registry address for layer ${this.layer}`);
    }
    if (!this.registry) {
      this.registry = new Contract(this.registryAddress, REGISTRY_ABI, this.wallet ?? this.provider);
    }
    return this.registry;
  }

  async getChainId(): Promise<bigint> {
    if (this.chainIdCache) return this.chainIdCache;
    const network = await this.provider.getNetwork();
    this.chainIdCache = BigInt(network.chainId);
    return this.chainIdCache;
  }

  async getLayerId(): Promise<GhostLayer> {
    if (this.layerIdCache) return this.layerIdCache;
    const hub = this.ensureHub();
    const layerRaw = (await hub.layerId()) as bigint;
    const layerId = Number(layerRaw);
    if (layerId !== 1 && layerId !== 2 && layerId !== 3) {
      throw new Error(`hub layerId out of range: ${layerRaw}`);
    }
    this.layerIdCache = layerId;
    return layerId;
  }

  async getSignerAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error("attestor wallet not configured");
    }
    return this.wallet.getAddress();
  }

  async isSignerAllowed(): Promise<boolean> {
    if (!this.registryAddress || !this.wallet) return false;
    const registry = this.ensureRegistry();
    const signer = await this.getSignerAddress();
    try {
      const allowed = (await registry.isSignerAllowed(signer)) as boolean;
      return Boolean(allowed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-attestor] registry allowlist check failed: ${message}`);
      return false;
    }
  }

  async getPolicySnapshot(): Promise<PolicySnapshot | null> {
    if (!this.registryAddress) return null;
    try {
      const registry = this.ensureRegistry();
      const [riskThresholdRaw, minConfidenceRaw, maxAgeRaw] = (await Promise.all([
        registry.getPolicy(policyKey(POLICY_KEYS.riskThresholdBps)),
        registry.getPolicy(policyKey(POLICY_KEYS.minConfidence)),
        registry.getPolicy(policyKey(POLICY_KEYS.maxAttestationAge))
      ])) as [bigint, bigint, bigint];
      return {
        riskThresholdBps: Number(riskThresholdRaw ?? 0n),
        minConfidence: Number(minConfidenceRaw ?? 0n),
        maxAttestationAgeSeconds: Number(maxAgeRaw ?? 0n)
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-attestor] policy snapshot failed: ${message}`);
      return null;
    }
  }

  async getOnChainNonce(): Promise<bigint> {
    if (!this.wallet) {
      throw new Error("attestor wallet not configured");
    }
    const hub = this.ensureHub();
    const signer = await this.getSignerAddress();
    const nonceRaw = (await hub.nonces(signer)) as bigint;
    return BigInt(nonceRaw);
  }

  async getLatestRisk(subject: string): Promise<LatestRiskSnapshot | null> {
    if (!this.hubAddress) return null;
    const hub = this.ensureHub();
    const subjectAddress = getAddress(subject);
    try {
      const result = (await hub.getLatestRisk(subjectAddress, this.layer)) as [
        bigint,
        bigint,
        string,
        bigint,
        bigint
      ];
      return {
        riskScoreBps: Number(result[0] ?? 0n),
        confidence: Number(result[1] ?? 0n),
        attestationId: result[2] ?? "",
        issuedAt: Number(result[3] ?? 0n),
        expiresAt: Number(result[4] ?? 0n)
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-attestor] latest risk read failed: ${message}`);
      return null;
    }
  }

  async submitAttestation(attestation: AIAttestation, signature: string): Promise<{
    attestationId: string;
    txHash: string;
    chainId: bigint;
    layerId: GhostLayer;
  }> {
    if (!this.wallet) {
      throw new Error("attestor wallet not configured");
    }
    const hub = this.ensureHub();
    const allowed = await this.isSignerAllowed();
    if (!allowed) {
      throw new Error("attestor signer is not allowlisted in AIOracleRegistry");
    }

    const [chainId, hubLayerId] = await Promise.all([this.getChainId(), this.getLayerId()]);
    if (hubLayerId !== this.layer) {
      throw new Error(`hub layer mismatch: expected=${this.layer} actual=${hubLayerId}`);
    }

    try {
      const tx = await hub.submitAttestation(attestation, signature);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;
      return {
        attestationId: attestation.attestationId,
        txHash,
        chainId,
        layerId: hubLayerId
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-attestor] submit failed: ${message}`);
      throw err;
    }
  }
}
