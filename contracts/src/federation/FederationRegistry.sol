// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (federation/FederationRegistry.sol)
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @title FederationRegistry
/// @notice On-chain registry for GhostStack global federation clusters.
/// @dev Six regions (NA, EU, AS, SA, AF, OC) are registered here.
///      Governance may add/remove clusters and update metadata hashes.
contract FederationRegistry is Governed {
    // ── Data Structures ─────────────────────────────────────────────

    struct ClusterRecord {
        bytes32 regionId;      // keccak256(regionCode), e.g. keccak256("NA")
        bytes32 metadataHash;  // off-chain cluster metadata IPFS/content hash
        uint16  nodeCount;
        uint16  validatorCount;
        bool    active;
        uint64  updatedAt;
    }

    // ── State ───────────────────────────────────────────────────────

    /// @notice regionId → ClusterRecord
    mapping(bytes32 => ClusterRecord) public clusters;

    /// @notice Ordered list of registered regionIds
    bytes32[] private _regionIds;

    /// @notice Set of registered regionIds (for deduplication)
    mapping(bytes32 => bool) private _registered;

    // ── Events ──────────────────────────────────────────────────────

    event ClusterRegistered(
        bytes32 indexed regionId,
        bytes32 metadataHash,
        uint16  nodeCount,
        uint16  validatorCount
    );

    event ClusterUpdated(
        bytes32 indexed regionId,
        bytes32 metadataHash,
        uint16  nodeCount,
        uint16  validatorCount
    );

    event ClusterDeactivated(bytes32 indexed regionId);
    event ClusterReactivated(bytes32 indexed regionId);

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    // ── Write (governance-gated) ────────────────────────────────────

    /// @notice Register a new region cluster.
    function registerCluster(
        bytes32 regionId,
        bytes32 metadataHash,
        uint16  nodeCount,
        uint16  validatorCount
    ) external onlyGovernance {
        require(!_registered[regionId], "FederationRegistry: already registered");
        require(regionId != bytes32(0), "FederationRegistry: zero regionId");

        clusters[regionId] = ClusterRecord({
            regionId:       regionId,
            metadataHash:   metadataHash,
            nodeCount:      nodeCount,
            validatorCount: validatorCount,
            active:         true,
            updatedAt:      uint64(block.timestamp)
        });

        _regionIds.push(regionId);
        _registered[regionId] = true;

        emit ClusterRegistered(regionId, metadataHash, nodeCount, validatorCount);
    }

    /// @notice Update an existing cluster's metadata.
    function updateCluster(
        bytes32 regionId,
        bytes32 metadataHash,
        uint16  nodeCount,
        uint16  validatorCount
    ) external onlyGovernance {
        require(_registered[regionId], "FederationRegistry: not registered");

        ClusterRecord storage rec = clusters[regionId];
        rec.metadataHash   = metadataHash;
        rec.nodeCount      = nodeCount;
        rec.validatorCount = validatorCount;
        rec.updatedAt      = uint64(block.timestamp);

        emit ClusterUpdated(regionId, metadataHash, nodeCount, validatorCount);
    }

    /// @notice Deactivate a cluster (e.g. for disaster recovery failover).
    function deactivateCluster(bytes32 regionId) external onlyGovernance {
        require(_registered[regionId], "FederationRegistry: not registered");
        clusters[regionId].active = false;
        clusters[regionId].updatedAt = uint64(block.timestamp);
        emit ClusterDeactivated(regionId);
    }

    /// @notice Reactivate a previously deactivated cluster.
    function reactivateCluster(bytes32 regionId) external onlyGovernance {
        require(_registered[regionId], "FederationRegistry: not registered");
        clusters[regionId].active = true;
        clusters[regionId].updatedAt = uint64(block.timestamp);
        emit ClusterReactivated(regionId);
    }

    // ── Read ─────────────────────────────────────────────────────────

    /// @notice Returns all registered regionIds.
    function getRegionIds() external view returns (bytes32[] memory) {
        return _regionIds;
    }

    /// @notice Returns only active cluster records.
    function getActiveClusters() external view returns (ClusterRecord[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _regionIds.length; i++) {
            if (clusters[_regionIds[i]].active) count++;
        }
        ClusterRecord[] memory result = new ClusterRecord[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _regionIds.length; i++) {
            ClusterRecord storage rec = clusters[_regionIds[i]];
            if (rec.active) result[idx++] = rec;
        }
        return result;
    }

    /// @notice Total count of registered regions (active + inactive).
    function clusterCount() external view returns (uint256) {
        return _regionIds.length;
    }
}
