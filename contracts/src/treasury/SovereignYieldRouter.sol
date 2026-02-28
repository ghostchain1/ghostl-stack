// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

interface ISovereignTreasuryAccounting {
    function l1ChainId() external view returns (uint256);
    function executedAllocations(bytes32 allocationId) external view returns (bool);
    function recordYieldReturn(bytes32 allocationId, uint256 amountWei, uint16 observedApyBps) external;
    function recordPrincipalReturn(bytes32 allocationId, uint256 amountWei) external;
}

/// @notice Governance-locked adapter router for reporting multi-chain yield and principal returns to L1 treasury.
/// @dev This contract is accounting-only; external bridge/strategy execution is intentionally out of scope.
contract SovereignYieldRouter is Governed, ReentrancyGuard {
    struct AdapterConfig {
        bool enabled;
        uint16 maxRiskScoreBps;
    }

    struct RoutedAllocation {
        uint256 destinationChainId;
        address adapter;
        uint256 deployedAmountWei;
        uint256 principalReturnedWei;
        uint256 yieldReturnedWei;
        uint16 riskScoreBps;
        bool closed;
    }

    address public immutable treasury;
    uint256 public immutable l1ChainId;

    bool public emergencyHalt;
    bool public routingPaused;

    mapping(uint256 => mapping(address => AdapterConfig)) public adapterConfigs;
    mapping(bytes32 => RoutedAllocation) public routedAllocations;

    event AdapterConfigured(uint256 indexed destinationChainId, address indexed adapter, bool enabled, uint16 maxRiskScoreBps);
    event RouterFlagsUpdated(bool emergencyHalt, bool routingPaused);
    event AllocationRouted(
        bytes32 indexed allocationId,
        uint256 indexed destinationChainId,
        address indexed adapter,
        uint256 deployedAmountWei,
        uint16 riskScoreBps,
        string governanceProposalId
    );
    event AllocationReturnReported(
        bytes32 indexed allocationId,
        address indexed reporter,
        uint256 principalWei,
        uint256 yieldWei,
        uint16 observedApyBps,
        bytes32 sourceRef,
        string governanceProposalId,
        uint256 cumulativePrincipalWei,
        uint256 cumulativeYieldWei,
        bool closed
    );
    event AllocationForceClosed(bytes32 indexed allocationId, string governanceProposalId);

    modifier onlyL1Chain() {
        require(block.chainid == l1ChainId, "l1_only");
        _;
    }

    modifier whenRoutingEnabled() {
        require(!emergencyHalt, "emergency_halt");
        require(!routingPaused, "routing_paused");
        _;
    }

    modifier onlyAdapterOrGovernance(address adapter) {
        require(
            msg.sender == adapter || msg.sender == governor || (timelock != address(0) && msg.sender == timelock),
            "not_adapter_or_governance"
        );
        _;
    }

    constructor(address governor_, address timelock_, address treasury_, uint256 l1ChainId_) Governed(governor_, timelock_) {
        require(treasury_ != address(0), "treasury=0");
        require(l1ChainId_ != 0, "l1_chain_id=0");
        require(ISovereignTreasuryAccounting(treasury_).l1ChainId() == l1ChainId_, "l1_chain_mismatch");
        treasury = treasury_;
        l1ChainId = l1ChainId_;
    }

    function setRouterFlags(bool emergencyHalt_, bool routingPaused_) external onlyGovernance {
        emergencyHalt = emergencyHalt_;
        routingPaused = routingPaused_;
        emit RouterFlagsUpdated(emergencyHalt_, routingPaused_);
    }

    function setAdapterConfig(uint256 destinationChainId, address adapter, bool enabled, uint16 maxRiskScoreBps)
        external
        onlyGovernance
    {
        require(destinationChainId != 0, "destination_chain_id=0");
        require(adapter != address(0), "adapter=0");
        require(maxRiskScoreBps <= 10_000, "risk_cap>10000");
        if (enabled) {
            require(maxRiskScoreBps > 0, "risk_cap=0");
        }

        adapterConfigs[destinationChainId][adapter] = AdapterConfig({enabled: enabled, maxRiskScoreBps: maxRiskScoreBps});
        emit AdapterConfigured(destinationChainId, adapter, enabled, maxRiskScoreBps);
    }

    function routeAllocation(
        bytes32 allocationId,
        uint256 destinationChainId,
        address adapter,
        uint256 deployedAmountWei,
        uint16 riskScoreBps,
        string calldata governanceProposalId
    ) external onlyGovernance onlyL1Chain whenRoutingEnabled {
        require(allocationId != bytes32(0), "allocation_id=0");
        require(destinationChainId != 0, "destination_chain_id=0");
        require(adapter != address(0), "adapter=0");
        require(deployedAmountWei > 0, "deployed=0");
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(riskScoreBps <= 10_000, "risk>10000");
        require(routedAllocations[allocationId].adapter == address(0), "allocation_exists");
        require(ISovereignTreasuryAccounting(treasury).executedAllocations(allocationId), "allocation_not_executed");

        AdapterConfig memory cfg = adapterConfigs[destinationChainId][adapter];
        require(cfg.enabled, "adapter_disabled");
        require(riskScoreBps <= cfg.maxRiskScoreBps, "adapter_risk_cap");

        routedAllocations[allocationId] = RoutedAllocation({
            destinationChainId: destinationChainId,
            adapter: adapter,
            deployedAmountWei: deployedAmountWei,
            principalReturnedWei: 0,
            yieldReturnedWei: 0,
            riskScoreBps: riskScoreBps,
            closed: false
        });

        emit AllocationRouted(
            allocationId,
            destinationChainId,
            adapter,
            deployedAmountWei,
            riskScoreBps,
            governanceProposalId
        );
    }

    function outstandingPrincipalWei(bytes32 allocationId) external view returns (uint256) {
        RoutedAllocation memory routed = routedAllocations[allocationId];
        if (routed.adapter == address(0)) return 0;
        if (routed.principalReturnedWei >= routed.deployedAmountWei) return 0;
        return routed.deployedAmountWei - routed.principalReturnedWei;
    }

    function recordAdapterReturn(
        bytes32 allocationId,
        uint256 principalWei,
        uint256 yieldWei,
        uint16 observedApyBps,
        bytes32 sourceRef,
        string calldata governanceProposalId
    ) external onlyL1Chain nonReentrant whenRoutingEnabled {
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(principalWei > 0 || yieldWei > 0, "return=0");

        RoutedAllocation storage routed = routedAllocations[allocationId];
        require(routed.adapter != address(0), "allocation_not_routed");
        require(!routed.closed, "allocation_closed");
        _requireAdapterOrGovernance(routed.adapter);

        if (principalWei > 0) {
            uint256 nextPrincipal = routed.principalReturnedWei + principalWei;
            require(nextPrincipal <= routed.deployedAmountWei, "principal_exceeds_deployed");
            routed.principalReturnedWei = nextPrincipal;
            ISovereignTreasuryAccounting(treasury).recordPrincipalReturn(allocationId, principalWei);
        }

        if (yieldWei > 0) {
            routed.yieldReturnedWei += yieldWei;
            ISovereignTreasuryAccounting(treasury).recordYieldReturn(allocationId, yieldWei, observedApyBps);
        }

        if (routed.principalReturnedWei == routed.deployedAmountWei) {
            routed.closed = true;
        }

        emit AllocationReturnReported(
            allocationId,
            msg.sender,
            principalWei,
            yieldWei,
            observedApyBps,
            sourceRef,
            governanceProposalId,
            routed.principalReturnedWei,
            routed.yieldReturnedWei,
            routed.closed
        );
    }

    function forceCloseAllocation(bytes32 allocationId, string calldata governanceProposalId)
        external
        onlyGovernance
        onlyL1Chain
    {
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        RoutedAllocation storage routed = routedAllocations[allocationId];
        require(routed.adapter != address(0), "allocation_not_routed");
        require(!routed.closed, "allocation_closed");
        routed.closed = true;
        emit AllocationForceClosed(allocationId, governanceProposalId);
    }

    function _requireAdapterOrGovernance(address adapter) internal view onlyAdapterOrGovernance(adapter) {}
}
