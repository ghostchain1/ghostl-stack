// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (interplanetary/InterplanetaryRegistry.sol)
pragma solidity ^0.8.24;

import { Governed } from "../common/Governed.sol";

/// @title InterplanetaryRegistry
/// @notice On-chain registry for GhostStack interplanetary relay nodes —
///         orbital satellites, lunar edge validators, and deep-space probes.
/// @dev Node identity is stored as a bytes32 id (keccak256 of off-chain UUID).
///      Governance may register and deactivate nodes; metadata is kept off-chain.
contract InterplanetaryRegistry is Governed {

    // ── Data Structures ──────────────────────────────────────────────────────

    /// @notice Node environment classification
    enum NodeEnvironment {
        EARTH,      // 0 — standard federation node
        ORBITAL,    // 1 — low-earth-orbit satellite relay
        LUNAR,      // 2 — lunar edge validator
        DEEP_SPACE  // 3 — deep-space mission node (>1 AU latency)
    }

    struct NodeRecord {
        bytes32         nodeId;        // keccak256(uuid)
        NodeEnvironment environment;
        bytes32         metadataHash;  // IPFS / content hash of off-chain metadata
        bool            active;
        uint64          registeredAt;  // Unix timestamp
        uint64          lastAnchoredAt; // last GDTP bundle anchor timestamp
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    mapping(bytes32 => NodeRecord) public nodes;
    bytes32[] private _nodeIds;

    // ── Events ────────────────────────────────────────────────────────────────

    event NodeRegistered(
        bytes32 indexed nodeId,
        NodeEnvironment indexed environment,
        bytes32 metadataHash,
        uint64 registeredAt
    );

    event NodeDeactivated(bytes32 indexed nodeId, uint64 deactivatedAt);

    event NodeMetadataUpdated(bytes32 indexed nodeId, bytes32 newMetadataHash);

    event NodeAnchorTimestamped(bytes32 indexed nodeId, uint64 anchoredAt);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address governor_, address timelock_)
        Governed(governor_, timelock_)
    {}

    // ── Governance Actions ────────────────────────────────────────────────────

    /// @notice Register a new interplanetary node.
    /// @param nodeId       keccak256 of the off-chain UUID for the node.
    /// @param environment  Node environment (EARTH=0, ORBITAL=1, LUNAR=2, DEEP_SPACE=3).
    /// @param metadataHash Off-chain metadata content hash (IPFS CID as bytes32).
    function registerNode(
        bytes32 nodeId,
        NodeEnvironment environment,
        bytes32 metadataHash
    ) external onlyGovernance {
        require(nodeId != bytes32(0), "INVALID_NODE_ID");
        require(!nodes[nodeId].active, "ALREADY_ACTIVE");

        NodeRecord storage rec = nodes[nodeId];
        rec.nodeId        = nodeId;
        rec.environment   = environment;
        rec.metadataHash  = metadataHash;
        rec.active        = true;
        rec.registeredAt  = uint64(block.timestamp);

        // Only grow the list for brand-new registrations
        if (rec.registeredAt == uint64(block.timestamp)) {
            _nodeIds.push(nodeId);
        }

        emit NodeRegistered(nodeId, environment, metadataHash, uint64(block.timestamp));
    }

    /// @notice Deactivate an existing node (does not delete record).
    function deactivateNode(bytes32 nodeId) external onlyGovernance {
        require(nodes[nodeId].active, "NOT_ACTIVE");
        nodes[nodeId].active = false;
        emit NodeDeactivated(nodeId, uint64(block.timestamp));
    }

    /// @notice Update the off-chain metadata hash for an active node.
    function updateMetadata(bytes32 nodeId, bytes32 newMetadataHash)
        external
        onlyGovernance
    {
        require(nodes[nodeId].active, "NOT_ACTIVE");
        nodes[nodeId].metadataHash = newMetadataHash;
        emit NodeMetadataUpdated(nodeId, newMetadataHash);
    }

    /// @notice Called by GDTPBundleAnchor when a bundle from this node is anchored.
    function touchAnchorTimestamp(bytes32 nodeId) external {
        require(
            msg.sender == governor || nodes[nodeId].active,
            "UNAUTHORIZED_TOUCH"
        );
        nodes[nodeId].lastAnchoredAt = uint64(block.timestamp);
        emit NodeAnchorTimestamped(nodeId, uint64(block.timestamp));
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// @notice Return the full node record for a given id.
    function getNode(bytes32 nodeId) external view returns (NodeRecord memory) {
        return nodes[nodeId];
    }

    /// @notice Return all registered node IDs (including inactive).
    function getAllNodeIds() external view returns (bytes32[] memory) {
        return _nodeIds;
    }

    /// @notice Return all active node IDs for a given environment.
    function getNodesByEnvironment(NodeEnvironment env)
        external
        view
        returns (bytes32[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < _nodeIds.length; i++) {
            NodeRecord storage rec = nodes[_nodeIds[i]];
            if (rec.active && rec.environment == env) count++;
        }
        bytes32[] memory result = new bytes32[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _nodeIds.length; i++) {
            NodeRecord storage rec = nodes[_nodeIds[i]];
            if (rec.active && rec.environment == env) {
                result[idx++] = _nodeIds[i];
            }
        }
        return result;
    }

    /// @notice Total number of registered nodes (including inactive).
    function totalNodes() external view returns (uint256) {
        return _nodeIds.length;
    }
}
