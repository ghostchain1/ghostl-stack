// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

interface ISovereignL1Treasury {
    function depositRevenueFromL2(uint256 amountWei) external;
}

/// @notice Canonical L2 revenue accumulator for L3 + L2 fee streams before forwarding to L1 treasury.
/// @dev In production, forwarding is expected to happen via a cross-domain relay. For same-chain testing,
///      this contract calls the configured treasury endpoint directly.
contract SovereignL2RevenueRouter is Governed, ReentrancyGuard {
    uint8 public constant SOURCE_L2 = 2;
    uint8 public constant SOURCE_L3 = 3;

    uint256 public immutable l2ChainId;
    address public immutable l1Treasury;

    uint256 public pendingRevenueWei;
    uint256 public totalL2RevenueWei;
    uint256 public totalL3RevenueWei;
    uint256 public totalForwardedToL1Wei;

    bool public emergencyHalt;
    bool public routingPaused;

    mapping(address => bool) public authorizedL2Sources;
    mapping(address => bool) public authorizedL3Sources;

    event SourceAuthorizationUpdated(address indexed source, uint8 indexed sourceLayer, bool allowed);
    event RevenueRecorded(
        address indexed source,
        uint8 indexed sourceLayer,
        bytes32 indexed sourceRef,
        uint256 amountWei,
        uint256 pendingRevenueWei
    );
    event RevenueForwardedToL1(
        address indexed treasury,
        uint256 amountWei,
        string governanceProposalId,
        uint256 pendingRevenueWei,
        uint256 totalForwardedToL1Wei
    );
    event RoutingFlagsUpdated(bool emergencyHalt, bool routingPaused);

    modifier onlyL2Chain() {
        require(block.chainid == l2ChainId, "l2_only");
        _;
    }

    modifier whenRoutingEnabled() {
        require(!emergencyHalt, "emergency_halt");
        require(!routingPaused, "routing_paused");
        _;
    }

    constructor(address governor_, address timelock_, uint256 l2ChainId_, address l1Treasury_) Governed(governor_, timelock_) {
        require(l2ChainId_ != 0, "l2_chain_id=0");
        require(l1Treasury_ != address(0), "l1_treasury=0");
        l2ChainId = l2ChainId_;
        l1Treasury = l1Treasury_;
    }

    function setSourceAuthorization(address source, uint8 sourceLayer, bool allowed) external onlyGovernance {
        require(source != address(0), "source=0");
        require(sourceLayer == SOURCE_L2 || sourceLayer == SOURCE_L3, "invalid_source_layer");

        if (sourceLayer == SOURCE_L2) {
            authorizedL2Sources[source] = allowed;
        } else {
            authorizedL3Sources[source] = allowed;
        }

        emit SourceAuthorizationUpdated(source, sourceLayer, allowed);
    }

    function setRoutingFlags(bool emergencyHalt_, bool routingPaused_) external onlyGovernance {
        emergencyHalt = emergencyHalt_;
        routingPaused = routingPaused_;
        emit RoutingFlagsUpdated(emergencyHalt_, routingPaused_);
    }

    function recordL2Revenue(uint256 amountWei, bytes32 sourceRef) external onlyL2Chain nonReentrant whenRoutingEnabled {
        require(authorizedL2Sources[msg.sender], "only_authorized_l2_source");
        _recordRevenue(SOURCE_L2, amountWei, sourceRef);
    }

    function recordL3Revenue(uint256 amountWei, bytes32 sourceRef) external onlyL2Chain nonReentrant whenRoutingEnabled {
        require(authorizedL3Sources[msg.sender], "only_authorized_l3_source");
        _recordRevenue(SOURCE_L3, amountWei, sourceRef);
    }

    /// @notice Forwards batched L2/L3 revenue to the configured L1 treasury endpoint.
    /// @dev Restricted to governance so route remains L3->L2->L1 with explicit protocol approval.
    function forwardRevenueToL1(uint256 amountWei, string calldata governanceProposalId)
        external
        onlyGovernance
        onlyL2Chain
        nonReentrant
        whenRoutingEnabled
    {
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(amountWei > 0, "amount=0");
        require(amountWei <= pendingRevenueWei, "insufficient_pending_revenue");

        pendingRevenueWei -= amountWei;
        totalForwardedToL1Wei += amountWei;

        ISovereignL1Treasury(l1Treasury).depositRevenueFromL2(amountWei);

        emit RevenueForwardedToL1(
            l1Treasury,
            amountWei,
            governanceProposalId,
            pendingRevenueWei,
            totalForwardedToL1Wei
        );
    }

    function _recordRevenue(uint8 sourceLayer, uint256 amountWei, bytes32 sourceRef) internal {
        require(amountWei > 0, "amount=0");

        pendingRevenueWei += amountWei;
        if (sourceLayer == SOURCE_L2) {
            totalL2RevenueWei += amountWei;
        } else {
            totalL3RevenueWei += amountWei;
        }

        emit RevenueRecorded(msg.sender, sourceLayer, sourceRef, amountWei, pendingRevenueWei);
    }
}
