// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/ai/EvidenceAnchor.sol";
import "../../src/ai/EvidenceBundle.sol";

contract EvidenceBundleTest is TestBase {
    EvidenceAnchor private anchor;
    EvidenceBundle private bundle;

    function setUp() public {
        anchor = new EvidenceAnchor(address(this), address(0));
        bundle = new EvidenceBundle(address(this), address(0), anchor);
        anchor.setGovernance(address(bundle), address(0));
    }

    function testBundleDeterministicId() public {
        EvidenceBundle.Bundle memory b = EvidenceBundle.Bundle({
            policyHash: keccak256("policy"),
            decisionHash: keccak256("decision"),
            modelHash: keccak256("model"),
            executionHash: keccak256("exec"),
            timestamp: block.timestamp,
            chainId: block.chainid,
            emitter: address(this)
        });

        (bytes32 id1, bytes32 anchorId1) = bundle.recordBundle(b, bytes(""));
        (bytes32 id2, bytes32 anchorId2) = bundle.recordBundle(b, bytes(""));

        bytes32 expected = keccak256(
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
        assertTrue(id1 == expected, "bundle id mismatch");
        assertTrue(id1 == id2, "id not deterministic");
        assertTrue(anchorId1 == anchorId2, "anchor id not stable");
    }

    function testBundleStoredMatches() public {
        EvidenceBundle.Bundle memory b = EvidenceBundle.Bundle({
            policyHash: keccak256("policy-2"),
            decisionHash: keccak256("decision-2"),
            modelHash: keccak256("model-2"),
            executionHash: keccak256("exec-2"),
            timestamp: block.timestamp,
            chainId: block.chainid,
            emitter: address(this)
        });

        (bytes32 bundleId, ) = bundle.recordBundle(b, bytes(""));
        EvidenceBundle.Bundle memory stored = bundle.getBundle(bundleId);
        assertTrue(stored.policyHash == b.policyHash, "policy mismatch");
        assertTrue(stored.decisionHash == b.decisionHash, "decision mismatch");
        assertTrue(stored.modelHash == b.modelHash, "model mismatch");
        assertTrue(stored.executionHash == b.executionHash, "exec mismatch");
        assertEq(stored.chainId, b.chainId, "chain mismatch");
        assertEq(stored.emitter, b.emitter, "emitter mismatch");
    }
}
