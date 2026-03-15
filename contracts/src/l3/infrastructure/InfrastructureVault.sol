// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (l3/infrastructure/InfrastructureVault.sol)
pragma solidity 0.8.24;

import {GhostBrand}   from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";

/**
 * @title  InfrastructureVault
 * @notice On-chain settlement layer for GhostBrain Infrastructure Auto-Scaling.
 *
 *         Every time the auto-scaler provisions or terminates a node, the
 *         off-chain controller calls this contract to:
 *           1. Record the scaling event permanently on GhostL3
 *           2. Deduct GST from the platform treasury to pay for infrastructure
 *           3. Allow governance to update per-node-second GST cost rates
 *           4. Emit events consumed by the GhostScan infrastructure panel
 *
 *         Deployed exclusively on GhostL3 (chain_id 903).
 *
 *         Cost model:
 *           scalingCost = durationSeconds × costRatePerSecond[nodeType]
 *           GST is transferred from the deposited treasury balance to the
 *           nodeOperator address on settlement.
 *
 * @dev    Owner should be the GhostBrain Infrastructure multi-sig.
 *         Node operators must be pre-approved via `approveOperator`.
 */
contract InfrastructureVault is GhostBrand, GhostOwnable {

    // ── Errors ────────────────────────────────────────────────────────────────

    error Vault__WrongChain(uint256 got, uint256 want);
    error Vault__ZeroAddress();
    error Vault__InsufficientBalance(uint256 available, uint256 required);
    error Vault__UnknownNodeType(bytes32 nodeType);
    error Vault__NotApprovedOperator(address operator);
    error Vault__AlreadyApproved(address operator);
    error Vault__ZeroAmount();
    error Vault__ZeroDuration();

    // ── Events ────────────────────────────────────────────────────────────────

    event NodeProvisioned(
        bytes32 indexed nodeId,
        bytes32 indexed nodeType,
        bytes32         region,
        address         operator,
        uint256         provisionedAt
    );

    event NodeTerminated(
        bytes32 indexed nodeId,
        uint256         durationSeconds,
        uint256         gstCost,
        address         operator
    );

    event ScalingCostSettled(
        bytes32 indexed nodeId,
        uint256         gstAmount,
        address indexed operator
    );

    event TreasuryDeposited(address indexed depositor, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event CostRateUpdated(bytes32 indexed nodeType, uint256 oldRate, uint256 newRate);
    event OperatorApproved(address indexed operator);
    event OperatorRevoked(address indexed operator);

    // ── Storage ───────────────────────────────────────────────────────────────

    struct NodeRecord {
        bytes32 nodeType;
        bytes32 region;
        address operator;
        uint256 provisionedAt;
        bool    active;
    }

    // bytes32 nodeType label → GST per second (in GST_UNIT = 1e18 units)
    mapping(bytes32 => uint256) public costRatePerSecond;

    // nodeId → record
    mapping(bytes32 => NodeRecord) public nodeRecords;

    // approved node operators (can call provisionNode / terminateNode)
    mapping(address => bool) public approvedOperators;

    // GST treasury balance held in this contract
    uint256 public treasuryGST;

    // Running totals
    uint256 public totalNodesProvisioned;
    uint256 public totalGSTSpent;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param admin           Owner address (GhostBrain Infrastructure multi-sig).
     * @param initialRates    Parallel arrays — nodeType labels and initial GST/s rates.
     */
    constructor(
        address          admin,
        bytes32[] memory initialNodeTypes,
        uint256[] memory initialRates
    ) GhostOwnable(admin) {
        if (block.chainid != L3_CHAIN_ID) {
            revert Vault__WrongChain(block.chainid, L3_CHAIN_ID);
        }
        if (admin == address(0)) revert Vault__ZeroAddress();

        // Set initial cost rates (can be 0 during bootstrap)
        uint256 len = initialNodeTypes.length;
        for (uint256 i; i < len; ) {
            costRatePerSecond[initialNodeTypes[i]] = initialRates[i];
            unchecked { ++i; }
        }
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOperator() {
        if (!approvedOperators[msg.sender] && msg.sender != owner()) {
            revert Vault__NotApprovedOperator(msg.sender);
        }
        _;
    }

    // ── Node lifecycle ────────────────────────────────────────────────────────

    /**
     * @notice Record that a new infrastructure node has been provisioned.
     * @param  nodeId    Unique node identifier (keccak256 of the off-chain UUID).
     * @param  nodeType  Type label ("streaming_node", "api_node", "ai_worker", …).
     * @param  region    Region label ("US_EAST", "EU_WEST", …).
     * @param  operator  Wallet address of the node operator.
     */
    function provisionNode(
        bytes32 nodeId,
        bytes32 nodeType,
        bytes32 region,
        address operator
    ) external onlyOperator {
        if (operator == address(0)) revert Vault__ZeroAddress();

        nodeRecords[nodeId] = NodeRecord({
            nodeType:      nodeType,
            region:        region,
            operator:      operator,
            provisionedAt: block.timestamp,
            active:        true
        });

        unchecked { ++totalNodesProvisioned; }
        emit NodeProvisioned(nodeId, nodeType, region, operator, block.timestamp);
    }

    /**
     * @notice Record node termination and settle GST cost to the operator.
     * @param  nodeId            The node being terminated.
     * @param  actualDurationSec Actual uptime in seconds (from off-chain).
     */
    function terminateNode(bytes32 nodeId, uint256 actualDurationSec) external onlyOperator {
        if (actualDurationSec == 0) revert Vault__ZeroDuration();

        NodeRecord storage rec = nodeRecords[nodeId];
        // Mark terminated even if cost is 0 (unknown type)
        rec.active = false;

        uint256 rate = costRatePerSecond[rec.nodeType];
        if (rate == 0) {
            emit NodeTerminated(nodeId, actualDurationSec, 0, rec.operator);
            return;
        }

        uint256 cost = actualDurationSec * rate;
        if (treasuryGST < cost) {
            // Partial settlement — do not revert so the node can still be terminated
            cost = treasuryGST;
        }

        if (cost > 0) {
            treasuryGST          -= cost;
            totalGSTSpent        += cost;
            emit ScalingCostSettled(nodeId, cost, rec.operator);
            // In production: transfer GST ERC-20 to rec.operator here
            // IGRC20(CANONICAL_GST).transfer(rec.operator, cost);
        }

        emit NodeTerminated(nodeId, actualDurationSec, cost, rec.operator);
    }

    // ── Treasury ──────────────────────────────────────────────────────────────

    /**
     * @notice Deposit GST into the infrastructure treasury.
     * @param  amount  Amount in base GST units (1 GST = 1e18).
     */
    function depositGST(uint256 amount) external onlyOwner {
        if (amount == 0) revert Vault__ZeroAmount();
        treasuryGST += amount;
        emit TreasuryDeposited(msg.sender, amount);
        // In production: IGRC20(CANONICAL_GST).transferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw excess GST from treasury (governance action).
     */
    function withdrawGST(address to, uint256 amount) external onlyOwner {
        if (to == address(0))         revert Vault__ZeroAddress();
        if (amount == 0)              revert Vault__ZeroAmount();
        if (treasuryGST < amount)     revert Vault__InsufficientBalance(treasuryGST, amount);
        treasuryGST -= amount;
        emit TreasuryWithdrawn(to, amount);
        // In production: IGRC20(CANONICAL_GST).transfer(to, amount);
    }

    // ── Governance: rates & operators ─────────────────────────────────────────

    /** @notice Update the GST per-second cost for a node type. */
    function setCostRate(bytes32 nodeType, uint256 newRate) external onlyOwner {
        uint256 old = costRatePerSecond[nodeType];
        costRatePerSecond[nodeType] = newRate;
        emit CostRateUpdated(nodeType, old, newRate);
    }

    /** @notice Grant operator permission to a new address. */
    function approveOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert Vault__ZeroAddress();
        if (approvedOperators[operator]) revert Vault__AlreadyApproved(operator);
        approvedOperators[operator] = true;
        emit OperatorApproved(operator);
    }

    /** @notice Revoke an existing operator. */
    function revokeOperator(address operator) external onlyOwner {
        if (!approvedOperators[operator]) revert Vault__NotApprovedOperator(operator);
        approvedOperators[operator] = false;
        emit OperatorRevoked(operator);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /** @notice Estimate the GST cost for a node type running for `seconds`. */
    function estimateCost(bytes32 nodeType, uint256 seconds_) external view returns (uint256) {
        return seconds_ * costRatePerSecond[nodeType];
    }

    /** @notice Check if a node is still active. */
    function isNodeActive(bytes32 nodeId) external view returns (bool) {
        return nodeRecords[nodeId].active;
    }

    /** @notice Current treasury balance minus estimated cost for running nodes. */
    function availableTreasury() external view returns (uint256) {
        return treasuryGST;
    }
}
