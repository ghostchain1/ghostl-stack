// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/compliance/ComplianceProofRegistry.sol";
import "../../src/compliance/RootComplianceOracle.sol";
import "../../src/compliance/ComplianceRootMirror.sol";
import "../../src/compliance/ComplianceProofGuard.sol";

contract CrossLayerComplianceSyncTest is TestBase {
    ComplianceProofRegistry private registry;
    RootComplianceOracle private oracle;

    function setUp() public {
        registry = new ComplianceProofRegistry(address(this), address(0));
        oracle = new RootComplianceOracle(address(this), address(0), address(registry));
    }

    function testRootUpdateRequiresProof() public {
        bytes32 rootHash = keccak256("root");
        bytes32 proofId = keccak256("proof");

        vm.expectRevert(bytes("invalid proof"));
        oracle.updateRoot(rootHash, proofId);

        registry.setProofStatus(proofId, true);
        uint256 epoch = oracle.updateRoot(rootHash, proofId);
        assertEq(epoch, 1, "epoch");
        assertTrue(oracle.latestRootHash() == rootHash, "root hash");
    }

    function testGuardWindow() public {
        bytes32 proofId = keccak256("proof");
        bytes32 root1 = keccak256("root1");
        bytes32 root2 = keccak256("root2");

        registry.setProofStatus(proofId, true);
        uint256 epoch1 = oracle.updateRoot(root1, proofId);

        ComplianceRootMirror mirror = new ComplianceRootMirror(address(this), address(0));
        ComplianceProofGuard guard = new ComplianceProofGuard(address(this), address(0), mirror);

        mirror.updateRoot(root1, epoch1, proofId);
        guard.setRequiredRoot(epoch1, root1);
        guard.setAllowedRootEpochWindow(0);
        guard.enforceLatestRoot();

        uint256 epoch2 = epoch1 + 1;
        mirror.updateRoot(root2, epoch2, proofId);

        vm.expectRevert(bytes("root stale"));
        guard.enforceLatestRoot();

        guard.setAllowedRootEpochWindow(1);
        guard.enforceLatestRoot();
    }
}
