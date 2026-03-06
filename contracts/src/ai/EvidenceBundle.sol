// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./EvidenceAnchor.sol";

/// @notice Deterministic evidence bundle recorder with optional anchoring.
contract EvidenceBundle is Governed {
    bytes32 public constant BUNDLE_KIND = keccak256("ghost.evidence.bundle");

    struct Bundle {
        bytes32 policyHash;
        bytes32 decisionHash;
        bytes32 modelHash;
        bytes32 executionHash;
        uint256 timestamp;
        uint256 chainId;
        address emitter;
    }

    EvidenceAnchor public evidenceAnchor;

    mapping(bytes32 => Bundle) private bundles;
    mapping(bytes32 => bytes32) public bundleAnchorId;
    mapping(bytes32 => bool) public bundleAnchored;

    event EvidenceAnchorUpdated(address indexed anchor);
    event BundleRecorded(
        bytes32 indexed bundleId,
        bytes32 indexed anchorId,
        bytes32 policyHash,
        bytes32 decisionHash,
        bytes32 modelHash,
        bytes32 executionHash,
        uint256 chainId,
        address emitter
    );

    constructor(address governor_, address timelock_, EvidenceAnchor anchor) Governed(governor_, timelock_) {
        evidenceAnchor = anchor;
        emit EvidenceAnchorUpdated(address(anchor));
    }

    function setEvidenceAnchor(EvidenceAnchor anchor) external onlyGovernance {
        evidenceAnchor = anchor;
        emit EvidenceAnchorUpdated(address(anchor));
    }

    function getBundle(bytes32 bundleId) external view returns (Bundle memory) {
        return bundles[bundleId];
    }

    function recordBundle(Bundle calldata b, bytes calldata extra) external returns (bytes32 bundleId, bytes32 anchorId) {
        require(b.emitter == msg.sender, "emitter mismatch");
        require(b.chainId != 0, "chainId=0");
        require(b.timestamp != 0, "timestamp=0");

        bundleId = keccak256(
            abi.encode(
                b.policyHash,
                b.decisionHash,
                b.modelHash,
                b.executionHash,
                b.timestamp,
                b.chainId,
                b.emitter
            )
        );

        Bundle storage existing = bundles[bundleId];
        if (existing.timestamp == 0) {
            bundles[bundleId] = b;
        }

        EvidenceAnchor anchor = evidenceAnchor;
        if (address(anchor) != address(0) && !bundleAnchored[bundleId]) {
            bundleAnchored[bundleId] = true;
            string memory uri = extra.length == 0 ? "" : abi.decode(extra, (string));
            uint256 index = anchor.anchor(BUNDLE_KIND, bundleId, uri);
            anchorId = bytes32(index);
            bundleAnchorId[bundleId] = anchorId;
        } else {
            anchorId = bundleAnchorId[bundleId];
        }

        emit BundleRecorded(
            bundleId,
            anchorId,
            b.policyHash,
            b.decisionHash,
            b.modelHash,
            b.executionHash,
            b.chainId,
            b.emitter
        );
    }
}
