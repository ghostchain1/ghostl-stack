// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (federation/GhostInterchainProtocol.sol)
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @title GhostInterchainProtocol (GIP)
/// @notice On-chain anchoring of governance-relay GIP messages.
/// @dev   Only governance-relay class messages are anchored on-chain.
///        High-frequency messages (block-sync, heartbeats) are handled
///        entirely off-chain by the federation coordinator service.
contract GhostInterchainProtocol is Governed {
    // ── Data Structures ─────────────────────────────────────────────

    struct GipAnchor {
        bytes32 messageId;
        bytes32 sourceRegion;   // keccak256(regionCode)
        bytes32 payloadHash;    // keccak256(abi.encode(payload))
        uint64  timestamp;
        bool    executed;
    }

    // ── State ───────────────────────────────────────────────────────

    /// @notice messageId → GipAnchor
    mapping(bytes32 => GipAnchor) public anchors;

    /// @notice Chronological list of message IDs
    bytes32[] private _messageIds;

    // ── Events ──────────────────────────────────────────────────────

    event MessageAnchored(
        bytes32 indexed messageId,
        bytes32 indexed sourceRegion,
        bytes32 payloadHash,
        uint64  timestamp
    );

    event MessageExecuted(bytes32 indexed messageId, address executor);

    // ── Errors ──────────────────────────────────────────────────────

    error GIP__AlreadyAnchored(bytes32 messageId);
    error GIP__NotAnchored(bytes32 messageId);
    error GIP__AlreadyExecuted(bytes32 messageId);

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    // ── Write ────────────────────────────────────────────────────────

    /// @notice Anchor a GIP governance-relay message on-chain.
    /// @param  messageId   Unique message identifier (UUID as bytes32).
    /// @param  sourceRegion keccak256 of the originating region code.
    /// @param  payloadHash keccak256 of the full message payload bytes.
    function anchorMessage(
        bytes32 messageId,
        bytes32 sourceRegion,
        bytes32 payloadHash
    ) external onlyGovernance {
        if (anchors[messageId].messageId != bytes32(0)) {
            revert GIP__AlreadyAnchored(messageId);
        }

        anchors[messageId] = GipAnchor({
            messageId:    messageId,
            sourceRegion: sourceRegion,
            payloadHash:  payloadHash,
            timestamp:    uint64(block.timestamp),
            executed:     false
        });

        _messageIds.push(messageId);

        emit MessageAnchored(messageId, sourceRegion, payloadHash, uint64(block.timestamp));
    }

    /// @notice Mark a previously anchored message as executed.
    /// @dev    Requires governance — autonomous execution is forbidden.
    function markExecuted(bytes32 messageId) external onlyGovernance {
        GipAnchor storage anchor = anchors[messageId];
        if (anchor.messageId == bytes32(0)) revert GIP__NotAnchored(messageId);
        if (anchor.executed) revert GIP__AlreadyExecuted(messageId);

        anchor.executed = true;
        emit MessageExecuted(messageId, msg.sender);
    }

    // ── Read ─────────────────────────────────────────────────────────

    /// @notice Returns all anchored message IDs.
    function getMessageIds() external view returns (bytes32[] memory) {
        return _messageIds;
    }

    /// @notice Returns the total count of anchored messages.
    function messageCount() external view returns (uint256) {
        return _messageIds.length;
    }

    /// @notice Returns only unexecuted anchors.
    function getPendingAnchors() external view returns (GipAnchor[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _messageIds.length; i++) {
            if (!anchors[_messageIds[i]].executed) count++;
        }
        GipAnchor[] memory result = new GipAnchor[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _messageIds.length; i++) {
            GipAnchor storage a = anchors[_messageIds[i]];
            if (!a.executed) result[idx++] = a;
        }
        return result;
    }
}
