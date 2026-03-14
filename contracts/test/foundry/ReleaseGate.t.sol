// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/ReleaseGate.sol";

contract MockLaunchGate {
    mapping(bytes32 => mapping(bytes32 => bool)) public authorized;

    function setAuthorized(bytes32 releaseId, bytes32 manifestHash, bool ok) external {
        authorized[releaseId][manifestHash] = ok;
    }

    function isLaunchAuthorized(bytes32 releaseId, bytes32 manifestHash) external view returns (bool) {
        return authorized[releaseId][manifestHash];
    }
}

contract ReleaseGateTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xBEEF);
    bytes32 private constant RELEASE_ID = keccak256("release-2026-02-25");
    bytes32 private constant MANIFEST_HASH = keccak256("manifest-2026-02-25");
    bytes32 private constant CONSTITUTION_HASH = keccak256("ghostchain-constitution-v1");
    bytes32 private constant PROPOSAL_HASH = keccak256("proposal:constitution-lock");
    bytes32 private constant ATTESTATION_HASH = keccak256("attestation:release");

    MockLaunchGate private launchGate;
    ReleaseGate private gate;

    function setUp() public {
        launchGate = new MockLaunchGate();
        gate = new ReleaseGate(GOVERNOR, TIMELOCK, address(launchGate));
    }

    function _configure(uint64 timelockAt, bool requireAttestation) internal {
        vm.prank(GOVERNOR);
        gate.setConstitutionHash(CONSTITUTION_HASH, true);
        vm.prank(GOVERNOR);
        gate.setReleaseManifestHash(MANIFEST_HASH, true);
        vm.prank(GOVERNOR);
        gate.setProposalIdHash(PROPOSAL_HASH, true);
        vm.prank(GOVERNOR);
        gate.setAttestationHash(ATTESTATION_HASH, true);

        ReleaseGate.LaunchConfig memory cfg = ReleaseGate.LaunchConfig({
            releaseId: RELEASE_ID,
            manifestHash: MANIFEST_HASH,
            constitutionHash: CONSTITUTION_HASH,
            releaseManifestHash: MANIFEST_HASH,
            proposalIdHash: PROPOSAL_HASH,
            attestationHash: ATTESTATION_HASH,
            timelockExpiresAt: timelockAt,
            attestationRequired: requireAttestation
        });

        vm.prank(GOVERNOR);
        gate.configureLaunch(cfg);
    }

    function testMainnetLaunchAllowedWhenAllChecksPass() public {
        _configure(uint64(block.timestamp), true);
        launchGate.setAuthorized(RELEASE_ID, MANIFEST_HASH, true);
        assertTrue(gate.isMainnetLaunchAllowed(), "launch should be allowed");
    }

    function testMainnetLaunchBlockedWhenUnderlyingLaunchGateDenied() public {
        _configure(uint64(block.timestamp), true);
        assertTrue(!gate.isMainnetLaunchAllowed(), "must be blocked when launch tuple not authorized");
    }

    function testMainnetLaunchBlockedWhenTimelockActive() public {
        _configure(uint64(block.timestamp + 1 days), true);
        launchGate.setAuthorized(RELEASE_ID, MANIFEST_HASH, true);
        assertTrue(!gate.isMainnetLaunchAllowed(), "must be blocked before timelock expiry");

        vm.warp(block.timestamp + 1 days);
        assertTrue(gate.isMainnetLaunchAllowed(), "must pass after timelock expiry");
    }

    function testMainnetLaunchBlockedWhenAttestationRequiredButMissing() public {
        vm.prank(GOVERNOR);
        gate.setConstitutionHash(CONSTITUTION_HASH, true);
        vm.prank(GOVERNOR);
        gate.setReleaseManifestHash(MANIFEST_HASH, true);
        vm.prank(GOVERNOR);
        gate.setProposalIdHash(PROPOSAL_HASH, true);

        ReleaseGate.LaunchConfig memory cfg = ReleaseGate.LaunchConfig({
            releaseId: RELEASE_ID,
            manifestHash: MANIFEST_HASH,
            constitutionHash: CONSTITUTION_HASH,
            releaseManifestHash: MANIFEST_HASH,
            proposalIdHash: PROPOSAL_HASH,
            attestationHash: ATTESTATION_HASH,
            timelockExpiresAt: uint64(block.timestamp),
            attestationRequired: true
        });

        vm.prank(GOVERNOR);
        gate.configureLaunch(cfg);

        launchGate.setAuthorized(RELEASE_ID, MANIFEST_HASH, true);
        assertTrue(!gate.isMainnetLaunchAllowed(), "must be blocked without approved attestation hash");
    }

    function testOnlyGovernanceCanConfigure() public {
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        gate.setConstitutionHash(CONSTITUTION_HASH, true);
    }
}
