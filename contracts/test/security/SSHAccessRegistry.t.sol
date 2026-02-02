// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import "../../src/security/SSHAccessRegistry.sol";

contract SSHAccessRegistryTest is TestBase {
    SSHAccessRegistry private registry;
    address private governor = address(this);

    bytes32 private constant SERVER_ID = keccak256("server-1");
    bytes32 private constant PRINCIPAL = keccak256("ghost");
    bytes32 private constant PUBKEY = keccak256("pubkey");

    function setUp() public {
        registry = new SSHAccessRegistry(governor, address(0));
    }

    function testGrantAndAuthorize() public {
        registry.grantAccess(SERVER_ID, PRINCIPAL, PUBKEY, uint64(block.timestamp + 3600), keccak256("role"), keccak256("policy"));
        assertTrue(registry.isAuthorized(SERVER_ID, PRINCIPAL, PUBKEY), "not authorized");
    }

    function testRevoke() public {
        registry.grantAccess(SERVER_ID, PRINCIPAL, PUBKEY, 0, keccak256("role"), keccak256("policy"));
        registry.revokeAccess(SERVER_ID, PRINCIPAL, PUBKEY, keccak256("reason"));
        assertTrue(!registry.isAuthorized(SERVER_ID, PRINCIPAL, PUBKEY), "still authorized");
    }

    function testExpiry() public {
        registry.grantAccess(SERVER_ID, PRINCIPAL, PUBKEY, uint64(block.timestamp + 10), keccak256("role"), keccak256("policy"));
        vm.warp(block.timestamp + 20);
        assertTrue(!registry.isAuthorized(SERVER_ID, PRINCIPAL, PUBKEY), "expired authorized");
    }

    function testAttestorReceipt() public {
        registry.grantAccess(SERVER_ID, PRINCIPAL, PUBKEY, 0, keccak256("role"), keccak256("policy"));
        registry.setAttestor(SERVER_ID, address(this), true);
        registry.submitLoginReceipt(SERVER_ID, PRINCIPAL, PUBKEY, keccak256("session"), uint64(block.timestamp), "");
    }

    function testAttestorBlocked() public {
        registry.grantAccess(SERVER_ID, PRINCIPAL, PUBKEY, 0, keccak256("role"), keccak256("policy"));
        vm.expectRevert();
        registry.submitLoginReceipt(SERVER_ID, PRINCIPAL, PUBKEY, keccak256("session"), uint64(block.timestamp), "");
    }
}
