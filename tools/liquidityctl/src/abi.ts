export const AdapterRegistryAbi = [
  "function configureAdapter(uint256 adapterId,(uint256 externalChainId,uint8 riskTier,uint256 maxDeployCap,uint64 settlementInterval,uint8 proofType,address operator,bool paused,bool enabled,uint64 updatedAt)) external",
  "function setMaxDeployCap(uint256 adapterId,uint256 maxDeployCap) external",
  "function setAdapterPaused(uint256 adapterId,bool paused) external",
  "function getAdapter(uint256 adapterId) view returns (tuple(uint256 externalChainId,uint8 riskTier,uint256 maxDeployCap,uint64 settlementInterval,uint8 proofType,address operator,bool paused,bool enabled,uint64 updatedAt))"
] as const;

export const CircuitBreakerAbi = [
  "function pauseAdapter(uint256 adapterId) external",
  "function unpauseAdapter(uint256 adapterId) external",
  "function pauseAll() external",
  "function unpauseAll() external",
  "function adapterPaused(uint256 adapterId) view returns (bool)",
  "function paused() view returns (bool)"
] as const;

export const LoadBalancerVaultAbi = [
  "function deployedByAdapterAsset(uint256 adapterId,address asset) view returns (uint256)",
  "function assetTotals(address asset) view returns (uint256 totalShares,uint256 idle,uint256 deployed)"
] as const;

export const SettlementOracleAbi = [
  "function canContinue(uint256 adapterId) view returns (bool ok,uint64 dueAt)",
  "function lastSettledAt(uint256 adapterId) view returns (uint64)",
  "function lastDeploymentAt(uint256 adapterId) view returns (uint64)",
  "function lastSequence(uint256 adapterId) view returns (uint256)",
  "function digestSettlement(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil) view returns (bytes32)",
  "function submitSettlement(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil,bytes[] signatures) external payable",
  "function submitSettlementZk(uint256 adapterId,address asset,uint256 yieldAmount,uint256 feeAmount,bytes32 commitment,uint256 sequence,uint64 issuedAt,uint64 validUntil,bytes proof) external payable",
  "function enforceSettlementWindow(uint256 adapterId) external"
] as const;

export const RewardRouterAbi = [
  "function queueConfig(address polReceiver,address burnReceiver,address validatorReceiver,uint16 polBps,uint16 burnBps,uint16 validatorBps) external returns (uint64)",
  "function activateConfig() external",
  "function setGasToken(address gasToken) external"
] as const;

export const ProposalExecutorAbi = [
  "function executeBatch(address[] targets,uint256[] values,bytes[] datas) external"
] as const;
