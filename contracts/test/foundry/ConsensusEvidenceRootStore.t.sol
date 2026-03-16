// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/ConsensusEvidenceRootStore.sol";

contract ConsensusEvidenceRootStoreTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant ATTACKER = address(0xD00D);
    address private constant REPORTER = address(0xCAFE);

    function testOnlyGovernanceCanRecordRoot() public {
        ConsensusEvidenceRootStore store = new ConsensusEvidenceRootStore(GOVERNOR, TIMELOCK);

        vm.prank(ATTACKER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        store.recordEvidenceRoot(keccak256("kind"), keccak256("root"), 0, 0, bytes32(0));

        bytes32 kind = keccak256("ghost.upgrade.audit.evidence");
        bytes32 root = keccak256("audit-root-v1");

        vm.prank(GOVERNOR);
        uint32 version = store.recordEvidenceRoot(kind, root, 0, 0, keccak256("meta"));
        assertEq(version, 1, "version increments");
        assertTrue(store.knownRootByKind(kind, root), "known root");
        assertTrue(store.isRootActive(kind, root), "root active");
    }

    function testValidityRangeMustIncrease() public {
        ConsensusEvidenceRootStore store = new ConsensusEvidenceRootStore(GOVERNOR, TIMELOCK);
        bytes32 kind = keccak256("ghost.upgrade.build.attestation");
        bytes32 root = keccak256("build-root-v1");

        vm.prank(TIMELOCK);
        vm.expectRevert(ConsensusEvidenceRootStore.InvalidValidityRange.selector);
        store.recordEvidenceRoot(kind, root, uint64(block.timestamp + 100), uint64(block.timestamp + 50), bytes32(0));
    }

    function testAuthorizedReporterCanAnchorEvidenceRoot() public {
        ConsensusEvidenceRootStore store = new ConsensusEvidenceRootStore(GOVERNOR, TIMELOCK);
        bytes32 kind = keccak256("ghost.consensus.l2.canonical.divergence");
        bytes32 root = keccak256("divergence-evidence-root");

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(ConsensusEvidenceRootStore.UnauthorizedReporter.selector, ATTACKER));
        store.recordEvidenceRootByReporter(kind, root, 0, 0, bytes32(0));

        vm.prank(GOVERNOR);
        store.setReporter(REPORTER, true);

        vm.prank(REPORTER);
        uint32 version = store.recordEvidenceRootByReporter(kind, root, 0, 0, keccak256("divergence-metadata"));
        assertEq(version, 1, "version increments");
        assertTrue(store.knownRootByKind(kind, root), "known root");

        (
            bytes32 storedRoot,
            uint32 storedVersion,
            uint64 recordedAt,
            uint64 validFrom,
            uint64 validUntil,
            bytes32 metadataHash,
            address recorder
        ) = store.latestRootByKind(kind);
        assertEq(storedRoot, root, "stored root");
        assertEq(storedVersion, 1, "stored version");
        assertTrue(recordedAt > 0, "recordedAt set");
        assertTrue(validFrom > 0, "validFrom set");
        assertEq(validUntil, 0, "validUntil open");
        assertEq(metadataHash, keccak256("divergence-metadata"), "metadata hash");
        assertEq(recorder, REPORTER, "reporter recorded");
    }
}
