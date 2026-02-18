// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/ConsensusEvidenceRootStore.sol";

contract ConsensusEvidenceRootStoreTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant ATTACKER = address(0xD00D);

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
}
