// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Append-only anchoring of model cards, reports, and configuration evidence.
contract EvidenceAnchor is Governed {
    struct AnchorRecord {
        bytes32 kind;
        bytes32 hash;
        string uri;
        uint64 anchoredAt;
        address anchoredBy;
    }

    AnchorRecord[] private anchors;

    event EvidenceAnchored(uint256 indexed index, bytes32 indexed kind, bytes32 indexed hash, string uri, address anchoredBy);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function anchor(bytes32 kind, bytes32 hash, string calldata uri) external onlyGovernance returns (uint256 index) {
        require(kind != bytes32(0), "kind=0");
        require(hash != bytes32(0), "hash=0");
        index = anchors.length;
        anchors.push(
            AnchorRecord({kind: kind, hash: hash, uri: uri, anchoredAt: uint64(block.timestamp), anchoredBy: msg.sender})
        );
        emit EvidenceAnchored(index, kind, hash, uri, msg.sender);
    }

    function anchorCount() external view returns (uint256) {
        return anchors.length;
    }

    function anchorAt(uint256 index) external view returns (AnchorRecord memory) {
        return anchors[index];
    }
}
