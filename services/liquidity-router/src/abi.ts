export const AdapterRegistryAbi = [
  "function getAdapter(uint256 adapterId) view returns (tuple(uint256 externalChainId,uint8 riskTier,uint256 maxDeployCap,uint64 settlementInterval,uint8 proofType,address operator,bool paused,bool enabled,uint64 updatedAt))",
  "function isAdapterKnown(uint256 adapterId) view returns (bool)"
] as const;

export const LoadBalancerVaultAbi = [
  "function deployToAdapter(uint256 adapterId,address asset,uint256 amount,bytes32 strategyId) external",
  "function unwindFromAdapter(uint256 adapterId,address asset,uint256 amount,bytes32 strategyId) external payable",
  "function deployedByAdapterAsset(uint256 adapterId,address asset) view returns (uint256)",
  "function assetTotals(address asset) view returns (uint256 totalShares,uint256 idle,uint256 deployed)",
  "function paused() view returns (bool)"
] as const;

export const SettlementOracleAbi = [
  "function getAdapter(uint256 adapterId) view returns (tuple(uint256 externalChainId,uint8 riskTier,uint256 maxDeployCap,uint64 settlementInterval,uint8 proofType,address operator,bool paused,bool enabled,uint64 updatedAt))",
  "function canContinue(uint256 adapterId) view returns (bool ok,uint64 dueAt)",
  "function lastSettledAt(uint256 adapterId) view returns (uint64)",
  "function lastDeploymentAt(uint256 adapterId) view returns (uint64)",
  "function lastSequence(uint256 adapterId) view returns (uint256)",
  "function digestSettlement(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil) view returns (bytes32)",
  "function submitSettlement(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil,bytes[] signatures) external payable",
  "function submitSettlementZk(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil,bytes proof) external payable",
  "function enforceSettlementWindow(uint256 adapterId) external"
] as const;

export const CircuitBreakerAbi = [
  "function paused() view returns (bool)",
  "function adapterPaused(uint256 adapterId) view returns (bool)"
] as const;

export const PolicyRegistryAbi = [
  "function constitutionHash() view returns (bytes32)",
  "function effectivePolicy(bytes32 key) view returns (uint256 value,uint32 version,bool emergency,bytes32 evidenceHash,uint64 effectiveAt)"
] as const;
