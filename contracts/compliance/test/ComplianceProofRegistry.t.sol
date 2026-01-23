// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ComplianceProofRegistry.sol";
import "../src/BridgeComplianceGuard.sol";

contract ComplianceProofRegistryTest is Test {
    ComplianceProofRegistry registry;
    BridgeComplianceGuard guard;

    address owner = address(0xA11CE);
    address issuer = address(0xBEEF);
    bytes32 subjectHash = keccak256("subject");
    bytes32 statement = keccak256("KYC_APPROVED");
    bytes32 proofHash = keccak256("proof");

    function setUp() public {
        registry = new ComplianceProofRegistry(owner);
        vm.prank(owner);
        registry.setIssuer(issuer, true);
        guard = new BridgeComplianceGuard(address(registry));
    }

    function testProofRegistrationAndValidation() public {
        vm.prank(issuer);
        registry.registerProof(subjectHash, statement, proofHash, block.timestamp + 1 days);
        bool ok = registry.isProofValid(subjectHash, statement);
        assertTrue(ok);
    }

    function testExpiredProofFails() public {
        vm.prank(issuer);
        registry.registerProof(subjectHash, statement, proofHash, block.timestamp + 1);
        vm.warp(block.timestamp + 2);
        bool ok = registry.isProofValid(subjectHash, statement);
        assertFalse(ok);
    }

    function testGuardBlocksMissingProof() public {
        vm.expectRevert(ComplianceProofGuard.ProofInvalid.selector);
        guard.guardedBridge(subjectHash, statement);
    }

    function testGuardAllowsProof() public {
        vm.prank(issuer);
        registry.registerProof(subjectHash, statement, proofHash, block.timestamp + 1 days);
        guard.guardedBridge(subjectHash, statement);
    }
}
