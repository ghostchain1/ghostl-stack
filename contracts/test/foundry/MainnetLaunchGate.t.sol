// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/MainnetLaunchGate.sol";

contract MockPolicyOracle {
    mapping(bytes32 => bool) public accepted;

    function setAccepted(bytes32 policyHash, bool allowed) external {
        accepted[policyHash] = allowed;
    }

    function isPolicyHashAccepted(bytes32 policyHash) external view returns (bool) {
        return accepted[policyHash];
    }
}

contract DummyFinalityOracle {}

contract MainnetLaunchGateTest is TestBase {
    address private constant TIMELOCK = address(0xBEEF);
    bytes32 private constant RELEASE_ID = keccak256("release-v2");
    bytes32 private constant MANIFEST_HASH = keccak256("manifest-v2");
    bytes32 private constant GENESIS_HASH_L1 = keccak256("genesis-l1");
    bytes32 private constant ROLLUP_HASH_L2 = keccak256("rollup-l2");
    bytes32 private constant ROLLUP_HASH_L3 = keccak256("rollup-l3");
    bytes32 private constant IMAGES_LOCK_HASH = keccak256("images-lock");
    bytes32 private constant POLICY_HASH = keccak256("policy-hash");
    bytes32 private constant CASCADING_VALIDATION_HASH = keccak256("cascading-validation");

    MainnetLaunchGate private gate;
    MockPolicyOracle private l1Oracle;
    DummyFinalityOracle private l2Oracle;
    DummyFinalityOracle private l3Oracle;

    function setUp() public {
        gate = new MainnetLaunchGate(TIMELOCK);
        l1Oracle = new MockPolicyOracle();
        l2Oracle = new DummyFinalityOracle();
        l3Oracle = new DummyFinalityOracle();
    }

    function testLegacyAuthorizationBlockedWhenStrictEnabled() public {
        vm.prank(TIMELOCK);
        vm.expectRevert(abi.encodeWithSelector(MainnetLaunchGate.MissingCascadingRequirements.selector));
        gate.authorizeMainnetLaunch(
            RELEASE_ID, MANIFEST_HASH, GENESIS_HASH_L1, ROLLUP_HASH_L2, ROLLUP_HASH_L3, IMAGES_LOCK_HASH
        );
    }

    function testAuthorizeWithRequirementsRequiresAcceptedPolicyHash() public {
        vm.prank(TIMELOCK);
        vm.expectRevert(abi.encodeWithSelector(MainnetLaunchGate.PolicyHashNotAccepted.selector, POLICY_HASH));
        gate.authorizeMainnetLaunchWithRequirements(
            RELEASE_ID,
            MANIFEST_HASH,
            GENESIS_HASH_L1,
            ROLLUP_HASH_L2,
            ROLLUP_HASH_L3,
            IMAGES_LOCK_HASH,
            address(l1Oracle),
            address(l2Oracle),
            address(l3Oracle),
            POLICY_HASH,
            CASCADING_VALIDATION_HASH
        );

        l1Oracle.setAccepted(POLICY_HASH, true);

        vm.prank(TIMELOCK);
        gate.authorizeMainnetLaunchWithRequirements(
            RELEASE_ID,
            MANIFEST_HASH,
            GENESIS_HASH_L1,
            ROLLUP_HASH_L2,
            ROLLUP_HASH_L3,
            IMAGES_LOCK_HASH,
            address(l1Oracle),
            address(l2Oracle),
            address(l3Oracle),
            POLICY_HASH,
            CASCADING_VALIDATION_HASH
        );

        assertTrue(gate.isLaunchAuthorized(RELEASE_ID, MANIFEST_HASH), "launch should be authorized");
        assertTrue(gate.requirementsDigest(RELEASE_ID, MANIFEST_HASH) != bytes32(0), "requirements digest set");
    }
}
