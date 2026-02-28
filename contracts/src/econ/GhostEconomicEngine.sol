// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

interface IEconStrategyAdapter {
    function adapterId() external view returns (bytes32);
    function deposit(uint256 amountWei) external;
    function withdraw(uint256 amountWei) external returns (uint256 principalWei, uint256 yieldWei);
    function currentValueWei() external view returns (uint256);
}

interface IMainnetActivationGate {
    function isMainnetExecutionEnabled() external view returns (bool);
}

contract MainnetActivationGate is Governed {
    bool public mainnetExecutionEnabled;
    bytes32 public lastProposalRef;

    event MainnetExecutionToggled(bool enabled, bytes32 indexed proposalRef, address indexed executor);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setMainnetExecutionEnabled(bool enabled, bytes32 proposalRef) external onlyGovernance {
        require(proposalRef != bytes32(0), "proposal_ref=0");
        mainnetExecutionEnabled = enabled;
        lastProposalRef = proposalRef;
        emit MainnetExecutionToggled(enabled, proposalRef, msg.sender);
    }

    function isMainnetExecutionEnabled() external view returns (bool) {
        return mainnetExecutionEnabled;
    }
}

contract SupplyAndFlowOracle is Governed {
    uint256 public totalL3ToL2Wei;
    uint256 public totalL2ToL1Wei;
    uint256 public totalL1ExternalAllocatedWei;
    uint256 public totalL1YieldReturnedWei;
    uint256 public totalL1DistributedWei;

    mapping(address => bool) public reporters;

    event ReporterUpdated(address indexed reporter, bool allowed);
    event FlowRecorded(bytes32 indexed flowType, uint256 amountWei, bytes32 indexed ref);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier onlyReporter() {
        require(
            reporters[msg.sender] || msg.sender == governor || (timelock != address(0) && msg.sender == timelock),
            "not_reporter"
        );
        _;
    }

    function setReporter(address reporter, bool allowed) external onlyGovernance {
        require(reporter != address(0), "reporter=0");
        reporters[reporter] = allowed;
        emit ReporterUpdated(reporter, allowed);
    }

    function recordL3ToL2(uint256 amountWei, bytes32 ref) external onlyReporter {
        require(amountWei > 0, "amount=0");
        totalL3ToL2Wei += amountWei;
        emit FlowRecorded("L3_TO_L2", amountWei, ref);
    }

    function recordL2ToL1(uint256 amountWei, bytes32 ref) external onlyReporter {
        require(amountWei > 0, "amount=0");
        totalL2ToL1Wei += amountWei;
        emit FlowRecorded("L2_TO_L1", amountWei, ref);
    }

    function recordL1ExternalAllocated(uint256 amountWei, bytes32 ref) external onlyReporter {
        require(amountWei > 0, "amount=0");
        totalL1ExternalAllocatedWei += amountWei;
        emit FlowRecorded("L1_EXTERNAL_ALLOC", amountWei, ref);
    }

    function recordL1YieldReturned(uint256 amountWei, bytes32 ref) external onlyReporter {
        require(amountWei > 0, "amount=0");
        totalL1YieldReturnedWei += amountWei;
        emit FlowRecorded("L1_YIELD_RETURN", amountWei, ref);
    }

    function recordL1Distribution(uint256 amountWei, bytes32 ref) external onlyReporter {
        require(amountWei > 0, "amount=0");
        totalL1DistributedWei += amountWei;
        emit FlowRecorded("L1_DISTRIBUTION", amountWei, ref);
    }
}

contract L1TreasuryReceiver is Governed, ReentrancyGuard {
    uint256 public immutable l1ChainId;
    address public l2FeeRouter;
    uint256 public totalReceivedFromL2Wei;
    bool public paused;

    event L2FeeRouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event RevenueReceivedFromL2(
        address indexed router, uint256 amountWei, bytes32 indexed flowRef, uint256 totalReceivedWei
    );
    event PauseUpdated(bool paused);

    constructor(address governor_, address timelock_, uint256 l1ChainId_) Governed(governor_, timelock_) {
        require(l1ChainId_ != 0, "l1_chain_id=0");
        l1ChainId = l1ChainId_;
    }

    modifier onlyL2FeeRouter() {
        require(msg.sender == l2FeeRouter, "only_l2_fee_router");
        _;
    }

    modifier onlyL1() {
        require(block.chainid == l1ChainId, "l1_only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    function setL2FeeRouter(address nextRouter) external onlyGovernance {
        require(nextRouter != address(0), "router=0");
        address previous = l2FeeRouter;
        l2FeeRouter = nextRouter;
        emit L2FeeRouterUpdated(previous, nextRouter);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function depositFromL2(uint256 amountWei, bytes32 flowRef)
        external
        onlyL2FeeRouter
        onlyL1
        nonReentrant
        whenNotPaused
    {
        require(amountWei > 0, "amount=0");
        totalReceivedFromL2Wei += amountWei;
        emit RevenueReceivedFromL2(msg.sender, amountWei, flowRef, totalReceivedFromL2Wei);
    }
}

contract L2FeeRouter is Governed, ReentrancyGuard {
    uint256 public immutable l2ChainId;
    address public immutable l1TreasuryReceiver;
    address public l3FeeRouter;
    address public supplyAndFlowOracle;

    uint256 public pendingL2NativeFeesWei;
    uint256 public totalL2NativeRecordedWei;
    uint256 public totalL3ForwardedInWei;
    uint256 public totalForwardedToL1Wei;

    bool public paused;

    mapping(address => bool) public authorizedL2Collectors;

    event L3FeeRouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event L2CollectorUpdated(address indexed collector, bool allowed);
    event SupplyAndFlowOracleUpdated(address indexed previousOracle, address indexed nextOracle);
    event L3RevenueAccepted(address indexed l3Router, uint256 amountWei, bytes32 indexed flowRef);
    event L2RevenueRecorded(address indexed collector, uint256 amountWei, bytes32 indexed flowRef);
    event RevenueForwardedToL1(uint256 amountWei, bytes32 indexed proposalRef, uint256 totalForwardedToL1Wei);
    event PauseUpdated(bool paused);

    constructor(address governor_, address timelock_, uint256 l2ChainId_, address l1TreasuryReceiver_)
        Governed(governor_, timelock_)
    {
        require(l2ChainId_ != 0, "l2_chain_id=0");
        require(l1TreasuryReceiver_ != address(0), "l1_treasury_receiver=0");
        l2ChainId = l2ChainId_;
        l1TreasuryReceiver = l1TreasuryReceiver_;
    }

    modifier onlyL2() {
        require(block.chainid == l2ChainId, "l2_only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    modifier onlyL3FeeRouter() {
        require(msg.sender == l3FeeRouter, "only_l3_fee_router");
        _;
    }

    function setL3FeeRouter(address nextRouter) external onlyGovernance {
        require(nextRouter != address(0), "router=0");
        address previous = l3FeeRouter;
        l3FeeRouter = nextRouter;
        emit L3FeeRouterUpdated(previous, nextRouter);
    }

    function setL2Collector(address collector, bool allowed) external onlyGovernance {
        require(collector != address(0), "collector=0");
        authorizedL2Collectors[collector] = allowed;
        emit L2CollectorUpdated(collector, allowed);
    }

    function setSupplyAndFlowOracle(address nextOracle) external onlyGovernance {
        address previous = supplyAndFlowOracle;
        supplyAndFlowOracle = nextOracle;
        emit SupplyAndFlowOracleUpdated(previous, nextOracle);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function acceptL3Fees(uint256 amountWei, bytes32 flowRef)
        external
        onlyL3FeeRouter
        onlyL2
        nonReentrant
        whenNotPaused
    {
        require(amountWei > 0, "amount=0");
        pendingL2NativeFeesWei += amountWei;
        totalL3ForwardedInWei += amountWei;

        if (supplyAndFlowOracle != address(0)) {
            SupplyAndFlowOracle(supplyAndFlowOracle).recordL3ToL2(amountWei, flowRef);
        }

        emit L3RevenueAccepted(msg.sender, amountWei, flowRef);
    }

    function recordL2Fees(uint256 amountWei, bytes32 flowRef) external onlyL2 nonReentrant whenNotPaused {
        require(authorizedL2Collectors[msg.sender], "only_l2_collector");
        require(amountWei > 0, "amount=0");

        pendingL2NativeFeesWei += amountWei;
        totalL2NativeRecordedWei += amountWei;
        emit L2RevenueRecorded(msg.sender, amountWei, flowRef);
    }

    function forwardToL1(uint256 amountWei, bytes32 proposalRef)
        external
        onlyGovernance
        onlyL2
        nonReentrant
        whenNotPaused
    {
        require(proposalRef != bytes32(0), "proposal_ref=0");
        require(amountWei > 0, "amount=0");
        require(amountWei <= pendingL2NativeFeesWei, "insufficient_pending");

        pendingL2NativeFeesWei -= amountWei;
        totalForwardedToL1Wei += amountWei;

        L1TreasuryReceiver(l1TreasuryReceiver).depositFromL2(amountWei, proposalRef);

        if (supplyAndFlowOracle != address(0)) {
            SupplyAndFlowOracle(supplyAndFlowOracle).recordL2ToL1(amountWei, proposalRef);
        }

        emit RevenueForwardedToL1(amountWei, proposalRef, totalForwardedToL1Wei);
    }
}

contract L3FeeRouter is Governed, ReentrancyGuard {
    uint256 public immutable l3ChainId;
    address public immutable l2FeeRouter;

    uint256 public pendingL3FeesWei;
    uint256 public totalCapturedL3FeesWei;
    uint256 public totalForwardedToL2Wei;

    bool public paused;

    mapping(address => bool) public authorizedL3Collectors;

    event L3CollectorUpdated(address indexed collector, bool allowed);
    event L3FeeCaptured(
        address indexed collector, uint256 amountWei, bytes32 indexed flowRef, uint256 pendingL3FeesWei
    );
    event L3FeesForwardedToL2(uint256 amountWei, bytes32 indexed proposalRef, uint256 totalForwardedToL2Wei);
    event PauseUpdated(bool paused);

    constructor(address governor_, address timelock_, uint256 l3ChainId_, address l2FeeRouter_)
        Governed(governor_, timelock_)
    {
        require(l3ChainId_ != 0, "l3_chain_id=0");
        require(l2FeeRouter_ != address(0), "l2_fee_router=0");
        l3ChainId = l3ChainId_;
        l2FeeRouter = l2FeeRouter_;
    }

    modifier onlyL3() {
        require(block.chainid == l3ChainId, "l3_only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    function setL3Collector(address collector, bool allowed) external onlyGovernance {
        require(collector != address(0), "collector=0");
        authorizedL3Collectors[collector] = allowed;
        emit L3CollectorUpdated(collector, allowed);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function captureFees(uint256 amountWei, bytes32 flowRef) external onlyL3 nonReentrant whenNotPaused {
        require(authorizedL3Collectors[msg.sender], "only_l3_collector");
        require(amountWei > 0, "amount=0");

        pendingL3FeesWei += amountWei;
        totalCapturedL3FeesWei += amountWei;

        emit L3FeeCaptured(msg.sender, amountWei, flowRef, pendingL3FeesWei);
    }

    function forwardToL2(uint256 amountWei, bytes32 proposalRef)
        external
        onlyGovernance
        onlyL3
        nonReentrant
        whenNotPaused
    {
        require(proposalRef != bytes32(0), "proposal_ref=0");
        require(amountWei > 0, "amount=0");
        require(amountWei <= pendingL3FeesWei, "insufficient_pending");

        pendingL3FeesWei -= amountWei;
        totalForwardedToL2Wei += amountWei;

        L2FeeRouter(l2FeeRouter).acceptL3Fees(amountWei, proposalRef);

        emit L3FeesForwardedToL2(amountWei, proposalRef, totalForwardedToL2Wei);
    }
}

contract RiskPolicyRegistry is Governed {
    uint16 public constant BPS_DENOM = 10_000;

    struct GlobalPolicy {
        uint16 maxVolatileExposureBps;
        uint16 minStableBufferBps;
        uint64 allocationCooldown;
        bool emergencyPause;
    }

    struct StrategyPolicy {
        bool allowlisted;
        uint16 maxAllocationBps;
        bool volatile;
        uint64 cooldown;
    }

    GlobalPolicy public globalPolicy;
    mapping(address => StrategyPolicy) public strategyPolicies;
    mapping(address => uint256) public lastAllocationAt;
    mapping(address => bool) public allocationReporters;

    event GlobalPolicyUpdated(
        uint16 maxVolatileExposureBps, uint16 minStableBufferBps, uint64 allocationCooldown, bool emergencyPause
    );
    event StrategyPolicyUpdated(
        address indexed strategy, bool allowlisted, uint16 maxAllocationBps, bool volatile, uint64 cooldown
    );
    event AllocationReporterUpdated(address indexed reporter, bool allowed);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        globalPolicy = GlobalPolicy({
            maxVolatileExposureBps: 3_500, minStableBufferBps: 2_500, allocationCooldown: 1 hours, emergencyPause: false
        });
    }

    function setGlobalPolicy(
        uint16 maxVolatileExposureBps,
        uint16 minStableBufferBps,
        uint64 allocationCooldown,
        bool emergencyPause
    ) external onlyGovernance {
        require(maxVolatileExposureBps <= BPS_DENOM, "volatile>10000");
        require(minStableBufferBps <= BPS_DENOM, "stable>10000");

        globalPolicy = GlobalPolicy({
            maxVolatileExposureBps: maxVolatileExposureBps,
            minStableBufferBps: minStableBufferBps,
            allocationCooldown: allocationCooldown,
            emergencyPause: emergencyPause
        });

        emit GlobalPolicyUpdated(maxVolatileExposureBps, minStableBufferBps, allocationCooldown, emergencyPause);
    }

    function setStrategyPolicy(
        address strategy,
        bool allowlisted,
        uint16 maxAllocationBps,
        bool volatile,
        uint64 cooldown
    ) external onlyGovernance {
        require(strategy != address(0), "strategy=0");
        require(maxAllocationBps <= BPS_DENOM, "strategy_bps>10000");

        strategyPolicies[strategy] = StrategyPolicy({
            allowlisted: allowlisted, maxAllocationBps: maxAllocationBps, volatile: volatile, cooldown: cooldown
        });

        emit StrategyPolicyUpdated(strategy, allowlisted, maxAllocationBps, volatile, cooldown);
    }

    function setAllocationReporter(address reporter, bool allowed) external onlyGovernance {
        require(reporter != address(0), "reporter=0");
        allocationReporters[reporter] = allowed;
        emit AllocationReporterUpdated(reporter, allowed);
    }

    function assertAllocationAllowed(
        address strategy,
        uint256 amountWei,
        uint256 totalAssetBaseWei,
        uint256 nextVolatileExposureBps,
        uint256 nextStableBufferBps
    ) external view {
        require(!globalPolicy.emergencyPause, "emergency_pause");
        require(amountWei > 0, "amount=0");
        require(strategy != address(0), "strategy=0");

        StrategyPolicy memory sp = strategyPolicies[strategy];
        require(sp.allowlisted, "strategy_not_allowlisted");

        if (sp.maxAllocationBps > 0) {
            require(totalAssetBaseWei > 0, "asset_base=0");
            uint256 strategyAllocBps = (amountWei * BPS_DENOM) / totalAssetBaseWei;
            require(strategyAllocBps <= sp.maxAllocationBps, "strategy_cap_exceeded");
        }

        if (sp.volatile) {
            require(nextVolatileExposureBps <= globalPolicy.maxVolatileExposureBps, "volatile_cap_exceeded");
        }

        require(nextStableBufferBps >= globalPolicy.minStableBufferBps, "stable_buffer_too_low");
        uint256 lastAt = lastAllocationAt[strategy];
        if (lastAt != 0) {
            require(block.timestamp >= lastAt + _effectiveCooldown(strategy), "cooldown_active");
        }
    }

    function recordAllocation(address strategy) external {
        require(
            msg.sender == governor || (timelock != address(0) && msg.sender == timelock)
                || allocationReporters[msg.sender],
            "not_executor"
        );
        lastAllocationAt[strategy] = block.timestamp;
    }

    function _effectiveCooldown(address strategy) internal view returns (uint256) {
        uint256 s = strategyPolicies[strategy].cooldown;
        if (s > 0) return s;
        return globalPolicy.allocationCooldown;
    }
}

contract TreasuryVault is Governed, ReentrancyGuard {
    struct StrategyPosition {
        uint256 principalWei;
        uint256 yieldWei;
        bool active;
    }

    uint256 public trackedAssetsWei;
    uint256 public stableBufferWei;
    uint256 public volatileExposureWei;

    address public l1TreasuryReceiver;
    address public distributionModule;
    address public allocationScheduler;
    address public riskPolicyRegistry;
    address public supplyAndFlowOracle;

    bool public paused;

    mapping(address => StrategyPosition) public strategyPositions;

    event L1TreasuryReceiverUpdated(address indexed previousReceiver, address indexed nextReceiver);
    event DistributionModuleUpdated(address indexed previousModule, address indexed nextModule);
    event AllocationSchedulerUpdated(address indexed previousScheduler, address indexed nextScheduler);
    event RiskPolicyRegistryUpdated(address indexed previousRegistry, address indexed nextRegistry);
    event SupplyAndFlowOracleUpdated(address indexed previousOracle, address indexed nextOracle);
    event RevenueDeposited(uint256 amountWei, bytes32 indexed flowRef, uint256 trackedAssetsWei);
    event StrategyAllocated(
        address indexed strategy, uint256 amountWei, bytes32 indexed proposalRef, bool volatileStrategy
    );
    event StrategyReturnReported(
        address indexed strategy, uint256 principalWei, uint256 yieldWei, bytes32 indexed flowRef
    );
    event DistributionExecuted(address indexed receiver, uint256 amountWei, bytes32 indexed proposalRef);
    event PauseUpdated(bool paused);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    modifier onlyL1TreasuryReceiver() {
        require(msg.sender == l1TreasuryReceiver, "only_l1_treasury_receiver");
        _;
    }

    modifier onlyDistributionModule() {
        require(msg.sender == distributionModule, "only_distribution_module");
        _;
    }

    modifier onlyGovernanceOrScheduler() {
        bool isGov = msg.sender == governor || (timelock != address(0) && msg.sender == timelock);
        require(isGov || msg.sender == allocationScheduler, "NOT_EXECUTOR");
        _;
    }

    function setL1TreasuryReceiver(address nextReceiver) external onlyGovernance {
        require(nextReceiver != address(0), "receiver=0");
        address previous = l1TreasuryReceiver;
        l1TreasuryReceiver = nextReceiver;
        emit L1TreasuryReceiverUpdated(previous, nextReceiver);
    }

    function setDistributionModule(address nextModule) external onlyGovernance {
        require(nextModule != address(0), "module=0");
        address previous = distributionModule;
        distributionModule = nextModule;
        emit DistributionModuleUpdated(previous, nextModule);
    }

    function setAllocationScheduler(address nextScheduler) external onlyGovernance {
        require(nextScheduler != address(0), "scheduler=0");
        address previous = allocationScheduler;
        allocationScheduler = nextScheduler;
        emit AllocationSchedulerUpdated(previous, nextScheduler);
    }

    function setRiskPolicyRegistry(address nextRegistry) external onlyGovernance {
        require(nextRegistry != address(0), "registry=0");
        address previous = riskPolicyRegistry;
        riskPolicyRegistry = nextRegistry;
        emit RiskPolicyRegistryUpdated(previous, nextRegistry);
    }

    function setSupplyAndFlowOracle(address nextOracle) external onlyGovernance {
        address previous = supplyAndFlowOracle;
        supplyAndFlowOracle = nextOracle;
        emit SupplyAndFlowOracleUpdated(previous, nextOracle);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function depositFromL1Router(uint256 amountWei, bytes32 flowRef) external onlyL1TreasuryReceiver whenNotPaused {
        require(amountWei > 0, "amount=0");
        trackedAssetsWei += amountWei;
        stableBufferWei += amountWei;

        emit RevenueDeposited(amountWei, flowRef, trackedAssetsWei);
    }

    function allocateToStrategy(address strategy, uint256 amountWei, bool volatileStrategy, bytes32 proposalRef)
        external
        onlyGovernanceOrScheduler
        nonReentrant
        whenNotPaused
    {
        require(strategy != address(0), "strategy=0");
        require(proposalRef != bytes32(0), "proposal_ref=0");
        require(amountWei > 0, "amount=0");
        require(stableBufferWei >= amountWei, "insufficient_stable_buffer");

        uint256 nextVolatileExposureWei = volatileExposureWei;
        if (volatileStrategy) {
            nextVolatileExposureWei += amountWei;
        }

        uint256 nextStableBufferWei = stableBufferWei - amountWei;
        uint256 nextVolatileBps = trackedAssetsWei == 0 ? 0 : (nextVolatileExposureWei * 10_000) / trackedAssetsWei;
        uint256 nextStableBps = trackedAssetsWei == 0 ? 10_000 : (nextStableBufferWei * 10_000) / trackedAssetsWei;

        RiskPolicyRegistry(riskPolicyRegistry)
            .assertAllocationAllowed(strategy, amountWei, trackedAssetsWei, nextVolatileBps, nextStableBps);

        stableBufferWei = nextStableBufferWei;
        volatileExposureWei = nextVolatileExposureWei;

        StrategyPosition storage p = strategyPositions[strategy];
        p.principalWei += amountWei;
        p.active = true;

        RiskPolicyRegistry(riskPolicyRegistry).recordAllocation(strategy);

        emit StrategyAllocated(strategy, amountWei, proposalRef, volatileStrategy);

        if (supplyAndFlowOracle != address(0)) {
            SupplyAndFlowOracle(supplyAndFlowOracle).recordL1ExternalAllocated(amountWei, proposalRef);
        }
    }

    function reportStrategyReturn(address strategy, uint256 principalWei, uint256 yieldWei, bytes32 flowRef)
        external
        onlyGovernance
        nonReentrant
        whenNotPaused
    {
        require(strategy != address(0), "strategy=0");
        require(principalWei > 0 || yieldWei > 0, "return=0");

        StrategyPosition storage p = strategyPositions[strategy];
        require(p.active, "strategy_inactive");

        if (principalWei > 0) {
            require(p.principalWei >= principalWei, "principal_overflow");
            p.principalWei -= principalWei;
            stableBufferWei += principalWei;
            if (volatileExposureWei >= principalWei) {
                volatileExposureWei -= principalWei;
            } else {
                volatileExposureWei = 0;
            }
        }

        if (yieldWei > 0) {
            p.yieldWei += yieldWei;
            trackedAssetsWei += yieldWei;
            stableBufferWei += yieldWei;

            if (supplyAndFlowOracle != address(0)) {
                SupplyAndFlowOracle(supplyAndFlowOracle).recordL1YieldReturned(yieldWei, flowRef);
            }
        }

        if (p.principalWei == 0) {
            p.active = false;
        }

        emit StrategyReturnReported(strategy, principalWei, yieldWei, flowRef);
    }

    function distribute(address receiver, uint256 amountWei, bytes32 proposalRef)
        external
        onlyDistributionModule
        nonReentrant
        whenNotPaused
    {
        require(receiver != address(0), "receiver=0");
        require(proposalRef != bytes32(0), "proposal_ref=0");
        require(amountWei > 0, "amount=0");
        require(stableBufferWei >= amountWei, "insufficient_stable_buffer");

        stableBufferWei -= amountWei;
        if (trackedAssetsWei >= amountWei) {
            trackedAssetsWei -= amountWei;
        } else {
            trackedAssetsWei = 0;
        }

        emit DistributionExecuted(receiver, amountWei, proposalRef);

        if (supplyAndFlowOracle != address(0)) {
            SupplyAndFlowOracle(supplyAndFlowOracle).recordL1Distribution(amountWei, proposalRef);
        }
    }
}

contract DistributionModule is Governed, ReentrancyGuard {
    address public treasuryVault;
    bool public paused;

    event TreasuryVaultUpdated(address indexed previousVault, address indexed nextVault);
    event DistributionRequested(address indexed receiver, uint256 amountWei, bytes32 indexed proposalRef);
    event PauseUpdated(bool paused);

    constructor(address governor_, address timelock_, address treasuryVault_) Governed(governor_, timelock_) {
        require(treasuryVault_ != address(0), "vault=0");
        treasuryVault = treasuryVault_;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    function setTreasuryVault(address nextVault) external onlyGovernance {
        require(nextVault != address(0), "vault=0");
        address previous = treasuryVault;
        treasuryVault = nextVault;
        emit TreasuryVaultUpdated(previous, nextVault);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function distributeTo(address receiver, uint256 amountWei, bytes32 proposalRef)
        external
        onlyGovernance
        nonReentrant
        whenNotPaused
    {
        TreasuryVault(treasuryVault).distribute(receiver, amountWei, proposalRef);
        emit DistributionRequested(receiver, amountWei, proposalRef);
    }
}

contract YieldStrategyRegistry is Governed {
    struct StrategyMeta {
        bool enabled;
        bool volatile;
        uint16 maxRiskBps;
        bytes32 strategyType;
        string uri;
    }

    mapping(address => StrategyMeta) public strategies;

    event StrategyUpdated(
        address indexed strategy,
        bool enabled,
        bool volatile,
        uint16 maxRiskBps,
        bytes32 indexed strategyType,
        string uri
    );

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setStrategy(
        address strategy,
        bool enabled,
        bool volatile,
        uint16 maxRiskBps,
        bytes32 strategyType,
        string calldata uri
    ) external onlyGovernance {
        require(strategy != address(0), "strategy=0");
        require(maxRiskBps <= 10_000, "risk>10000");

        strategies[strategy] = StrategyMeta({
            enabled: enabled, volatile: volatile, maxRiskBps: maxRiskBps, strategyType: strategyType, uri: uri
        });

        emit StrategyUpdated(strategy, enabled, volatile, maxRiskBps, strategyType, uri);
    }

    function isStrategyEnabled(address strategy) external view returns (bool) {
        return strategies[strategy].enabled;
    }

    function getStrategyMeta(address strategy) external view returns (StrategyMeta memory) {
        return strategies[strategy];
    }
}

contract AllocationScheduler is Governed, ReentrancyGuard {
    struct ScheduledAllocation {
        address strategy;
        uint256 amountWei;
        bool volatileStrategy;
        uint64 executeAfter;
        bool executed;
        bytes32 proposalRef;
        uint16 riskScoreBps;
    }

    uint64 public minDelay;
    bool public paused;
    address public treasuryVault;
    address public strategyRegistry;
    address public mainnetActivationGate;

    mapping(bytes32 => ScheduledAllocation) public allocations;

    event MinDelayUpdated(uint64 delaySeconds);
    event PauseUpdated(bool paused);
    event TreasuryVaultUpdated(address indexed previousVault, address indexed nextVault);
    event StrategyRegistryUpdated(address indexed previousRegistry, address indexed nextRegistry);
    event MainnetActivationGateUpdated(address indexed previousGate, address indexed nextGate);
    event AllocationQueued(
        bytes32 indexed allocationId,
        address indexed strategy,
        uint256 amountWei,
        bool volatileStrategy,
        uint64 executeAfter,
        bytes32 proposalRef,
        uint16 riskScoreBps
    );
    event AllocationExecuted(bytes32 indexed allocationId, address indexed strategy, uint256 amountWei);

    constructor(
        address governor_,
        address timelock_,
        address treasuryVault_,
        address strategyRegistry_,
        address mainnetActivationGate_,
        uint64 minDelaySeconds
    ) Governed(governor_, timelock_) {
        require(treasuryVault_ != address(0), "vault=0");
        require(strategyRegistry_ != address(0), "registry=0");
        require(mainnetActivationGate_ != address(0), "gate=0");

        treasuryVault = treasuryVault_;
        strategyRegistry = strategyRegistry_;
        mainnetActivationGate = mainnetActivationGate_;
        minDelay = minDelaySeconds;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function setMinDelay(uint64 minDelaySeconds) external onlyGovernance {
        minDelay = minDelaySeconds;
        emit MinDelayUpdated(minDelaySeconds);
    }

    function setTreasuryVault(address nextVault) external onlyGovernance {
        require(nextVault != address(0), "vault=0");
        address previous = treasuryVault;
        treasuryVault = nextVault;
        emit TreasuryVaultUpdated(previous, nextVault);
    }

    function setStrategyRegistry(address nextRegistry) external onlyGovernance {
        require(nextRegistry != address(0), "registry=0");
        address previous = strategyRegistry;
        strategyRegistry = nextRegistry;
        emit StrategyRegistryUpdated(previous, nextRegistry);
    }

    function setMainnetActivationGate(address nextGate) external onlyGovernance {
        require(nextGate != address(0), "gate=0");
        address previous = mainnetActivationGate;
        mainnetActivationGate = nextGate;
        emit MainnetActivationGateUpdated(previous, nextGate);
    }

    function queueAllocation(
        bytes32 allocationId,
        address strategy,
        uint256 amountWei,
        bool volatileStrategy,
        bytes32 proposalRef,
        uint16 riskScoreBps
    ) external onlyGovernance whenNotPaused {
        require(allocationId != bytes32(0), "allocation_id=0");
        require(strategy != address(0), "strategy=0");
        require(amountWei > 0, "amount=0");
        require(proposalRef != bytes32(0), "proposal_ref=0");
        require(allocations[allocationId].proposalRef == bytes32(0), "allocation_exists");
        require(riskScoreBps <= 10_000, "risk>10000");

        YieldStrategyRegistry.StrategyMeta memory meta =
            YieldStrategyRegistry(strategyRegistry).getStrategyMeta(strategy);
        require(meta.enabled, "strategy_disabled");
        require(riskScoreBps <= meta.maxRiskBps, "risk_cap_exceeded");

        uint64 executeAfter = uint64(block.timestamp) + minDelay;
        allocations[allocationId] = ScheduledAllocation({
            strategy: strategy,
            amountWei: amountWei,
            volatileStrategy: volatileStrategy,
            executeAfter: executeAfter,
            executed: false,
            proposalRef: proposalRef,
            riskScoreBps: riskScoreBps
        });

        emit AllocationQueued(
            allocationId, strategy, amountWei, volatileStrategy, executeAfter, proposalRef, riskScoreBps
        );
    }

    function executeAllocation(bytes32 allocationId) external nonReentrant whenNotPaused {
        ScheduledAllocation storage a = allocations[allocationId];
        require(a.proposalRef != bytes32(0), "allocation_missing");
        require(!a.executed, "allocation_executed");
        require(block.timestamp >= a.executeAfter, "timelock_active");
        require(IMainnetActivationGate(mainnetActivationGate).isMainnetExecutionEnabled(), "mainnet_gate_closed");

        a.executed = true;
        TreasuryVault(treasuryVault).allocateToStrategy(a.strategy, a.amountWei, a.volatileStrategy, a.proposalRef);

        emit AllocationExecuted(allocationId, a.strategy, a.amountWei);
    }
}

contract MockExternalYield is IEconStrategyAdapter, Governed {
    bytes32 public constant ADAPTER_ID = keccak256("mock_external_yield_v1");

    uint256 public principalWei;
    uint16 public syntheticYieldBps;
    bool public paused;

    event SyntheticYieldUpdated(uint16 yieldBps);
    event AdapterPaused(bool paused);
    event Deposited(uint256 amountWei, uint256 principalWei);
    event Withdrawn(uint256 amountWei, uint256 principalWei, uint256 yieldWei);

    constructor(address governor_, address timelock_, uint16 syntheticYieldBps_) Governed(governor_, timelock_) {
        require(syntheticYieldBps_ <= 5_000, "yield_bps_too_high");
        syntheticYieldBps = syntheticYieldBps_;
    }

    function adapterId() external pure returns (bytes32) {
        return ADAPTER_ID;
    }

    function setSyntheticYieldBps(uint16 yieldBps) external onlyGovernance {
        require(yieldBps <= 5_000, "yield_bps_too_high");
        syntheticYieldBps = yieldBps;
        emit SyntheticYieldUpdated(yieldBps);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit AdapterPaused(paused_);
    }

    function deposit(uint256 amountWei) external {
        require(!paused, "paused");
        require(amountWei > 0, "amount=0");
        principalWei += amountWei;
        emit Deposited(amountWei, principalWei);
    }

    function withdraw(uint256 amountWei) external returns (uint256 principalOutWei, uint256 yieldOutWei) {
        require(!paused, "paused");
        require(amountWei > 0, "amount=0");
        require(amountWei <= principalWei, "insufficient_principal");

        principalWei -= amountWei;
        principalOutWei = amountWei;
        yieldOutWei = (amountWei * syntheticYieldBps) / 10_000;

        emit Withdrawn(amountWei, principalOutWei, yieldOutWei);
    }

    function currentValueWei() external view returns (uint256) {
        uint256 syntheticYield = (principalWei * syntheticYieldBps) / 10_000;
        return principalWei + syntheticYield;
    }
}

contract TreasurySnapshot is Governed {
    struct Snapshot {
        uint64 timestamp;
        bytes32 merkleRoot;
        bytes32 manifestHash;
        bytes32 proposalRef;
        string uri;
    }

    mapping(uint256 => Snapshot) public snapshots;
    uint256 public latestEpoch;

    event SnapshotStored(uint256 indexed epoch, bytes32 indexed merkleRoot, bytes32 indexed proposalRef, string uri);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function storeSnapshot(
        uint256 epoch,
        bytes32 merkleRoot,
        bytes32 manifestHash,
        bytes32 proposalRef,
        string calldata uri
    ) external onlyGovernance {
        require(epoch > 0, "epoch=0");
        require(merkleRoot != bytes32(0), "merkle_root=0");
        require(proposalRef != bytes32(0), "proposal_ref=0");

        snapshots[epoch] = Snapshot({
            timestamp: uint64(block.timestamp),
            merkleRoot: merkleRoot,
            manifestHash: manifestHash,
            proposalRef: proposalRef,
            uri: uri
        });

        if (epoch > latestEpoch) {
            latestEpoch = epoch;
        }

        emit SnapshotStored(epoch, merkleRoot, proposalRef, uri);
    }
}

contract TreasuryGovernor is Governed, ReentrancyGuard {
    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        uint64 executeAfter;
        bool approved;
        bool executed;
        bytes32 ref;
    }

    uint64 public minDelay;
    mapping(bytes32 => Proposal) public proposals;

    event ProposalQueued(bytes32 indexed proposalId, address indexed target, uint64 executeAfter, bytes32 indexed ref);
    event ProposalApproved(bytes32 indexed proposalId, address indexed approver);
    event ProposalExecuted(bytes32 indexed proposalId, address indexed executor, bytes result);
    event MinDelayUpdated(uint64 delaySeconds);

    constructor(address governor_, address timelock_, uint64 minDelaySeconds) Governed(governor_, timelock_) {
        minDelay = minDelaySeconds;
    }

    function setMinDelay(uint64 delaySeconds) external onlyGovernance {
        minDelay = delaySeconds;
        emit MinDelayUpdated(delaySeconds);
    }

    function queueProposal(bytes32 proposalId, address target, uint256 value, bytes calldata data, bytes32 ref)
        external
        onlyGovernance
    {
        require(proposalId != bytes32(0), "proposal_id=0");
        require(ref != bytes32(0), "proposal_ref=0");
        require(target != address(0), "target=0");
        require(proposals[proposalId].ref == bytes32(0), "proposal_exists");

        uint64 executeAfter = uint64(block.timestamp) + minDelay;
        proposals[proposalId] = Proposal({
            target: target,
            value: value,
            data: data,
            executeAfter: executeAfter,
            approved: false,
            executed: false,
            ref: ref
        });

        emit ProposalQueued(proposalId, target, executeAfter, ref);
    }

    function approveProposal(bytes32 proposalId) external onlyGovernance {
        Proposal storage p = proposals[proposalId];
        require(p.ref != bytes32(0), "proposal_missing");
        require(!p.executed, "proposal_executed");
        p.approved = true;
        emit ProposalApproved(proposalId, msg.sender);
    }

    function executeProposal(bytes32 proposalId) external nonReentrant returns (bytes memory result) {
        Proposal storage p = proposals[proposalId];
        require(p.ref != bytes32(0), "proposal_missing");
        require(p.approved, "proposal_not_approved");
        require(!p.executed, "proposal_executed");
        require(block.timestamp >= p.executeAfter, "timelock_active");

        p.executed = true;
        (bool ok, bytes memory callResult) = p.target.call{value: p.value}(p.data);
        require(ok, "proposal_call_failed");

        emit ProposalExecuted(proposalId, msg.sender, callResult);
        return callResult;
    }
}
