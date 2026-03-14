// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (interplanetary/GDTPBundleAnchor.sol)
pragma solidity ^0.8.24;

import { Governed } from "../common/Governed.sol";

/// @title GDTPBundleAnchor
/// @notice On-chain commitment store for GDTP (Ghost Delay-Tolerant Protocol) bundles.
/// @dev Anchors Merkle roots and ZK proof hashes for bundles relayed across
///      interplanetary links. Once a bundle is settled, its state is finalised.
///      Anchor submission is restricted to governance / trusted relayer; settlement
///      may only be called by governance.
contract GDTPBundleAnchor is Governed {

    // ── Data Structures ──────────────────────────────────────────────────────

    struct BundleAnchor {
        bytes32 bundleId;     // keccak256 of off-chain bundle UUID
        bytes32 merkleRoot;   // Merkle root of the bundled transaction set
        bytes32 zkProofHash;  // ZK validity proof hash (stub or real Groth16)
        bytes32 sourceNodeId; // keccak256(nodeId) of originating interplanetary node
        uint32  txCount;      // number of transactions in the bundle
        bool    settled;      // true once L1 settlement is confirmed
        uint64  anchoredAt;   // block timestamp when anchored
        uint64  settledAt;    // block timestamp when settled (0 if pending)
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    mapping(bytes32 => BundleAnchor) public anchors;
    bytes32[] private _bundleIds;

    /// @notice Trusted relayer address allowed to anchor bundles without full governance
    address public relayer;

    // ── Events ────────────────────────────────────────────────────────────────

    event BundleAnchored(
        bytes32 indexed bundleId,
        bytes32 indexed sourceNodeId,
        bytes32 merkleRoot,
        bytes32 zkProofHash,
        uint32  txCount,
        uint64  anchoredAt
    );

    event BundleSettled(bytes32 indexed bundleId, uint64 settledAt);

    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address governor_, address timelock_, address relayer_)
        Governed(governor_, timelock_)
    {
        relayer = relayer_;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyRelayerOrGovernance() {
        _onlyRelayerOrGovernance();
        _;
    }

    function _onlyRelayerOrGovernance() internal view {
        require(
            msg.sender == relayer ||
            msg.sender == governor ||
            (timelock != address(0) && msg.sender == timelock),
            "NOT_RELAYER_OR_GOVERNANCE"
        );
    }

    // ── Anchor Actions ────────────────────────────────────────────────────────

    /// @notice Anchor a new GDTP bundle commitment on-chain.
    /// @param bundleId     keccak256 of the off-chain bundle UUID.
    /// @param merkleRoot   SHA-256 Merkle root of the bundled tx hashes.
    /// @param zkProofHash  ZK validity proof hash (stub: multi-round SHA-256).
    /// @param sourceNodeId keccak256 of the originating node ID.
    /// @param txCount      Number of transactions in the bundle.
    function anchorBundle(
        bytes32 bundleId,
        bytes32 merkleRoot,
        bytes32 zkProofHash,
        bytes32 sourceNodeId,
        uint32  txCount
    ) external onlyRelayerOrGovernance {
        require(bundleId   != bytes32(0), "INVALID_BUNDLE_ID");
        require(merkleRoot != bytes32(0), "INVALID_MERKLE_ROOT");
        require(anchors[bundleId].anchoredAt == 0, "ALREADY_ANCHORED");
        require(txCount > 0, "EMPTY_BUNDLE");

        BundleAnchor storage anchor = anchors[bundleId];
        anchor.bundleId    = bundleId;
        anchor.merkleRoot  = merkleRoot;
        anchor.zkProofHash = zkProofHash;
        anchor.sourceNodeId = sourceNodeId;
        anchor.txCount     = txCount;
        anchor.settled     = false;
        anchor.anchoredAt  = uint64(block.timestamp);

        _bundleIds.push(bundleId);

        emit BundleAnchored(bundleId, sourceNodeId, merkleRoot, zkProofHash, txCount, uint64(block.timestamp));
    }

    /// @notice Mark an anchored bundle as settled (L1 finality confirmed).
    function markSettled(bytes32 bundleId) external onlyGovernance {
        BundleAnchor storage anchor = anchors[bundleId];
        require(anchor.anchoredAt != 0, "NOT_ANCHORED");
        require(!anchor.settled, "ALREADY_SETTLED");
        anchor.settled   = true;
        anchor.settledAt = uint64(block.timestamp);
        emit BundleSettled(bundleId, uint64(block.timestamp));
    }

    /// @notice Update the trusted relayer address (governance only).
    function setRelayer(address newRelayer) external onlyGovernance {
        require(newRelayer != address(0), "relayer=0");
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// @notice Fetch an anchor record by bundle id.
    function getAnchor(bytes32 bundleId) external view returns (BundleAnchor memory) {
        return anchors[bundleId];
    }

    /// @notice Return all bundle IDs (including settled).
    function getAllBundleIds() external view returns (bytes32[] memory) {
        return _bundleIds;
    }

    /// @notice Return all pending (unsettled) anchor records.
    function getPendingAnchors() external view returns (BundleAnchor[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _bundleIds.length; i++) {
            if (!anchors[_bundleIds[i]].settled) count++;
        }
        BundleAnchor[] memory result = new BundleAnchor[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _bundleIds.length; i++) {
            BundleAnchor storage a = anchors[_bundleIds[i]];
            if (!a.settled) result[idx++] = a;
        }
        return result;
    }

    /// @notice Total number of anchored bundles.
    function totalAnchors() external view returns (uint256) {
        return _bundleIds.length;
    }
}
