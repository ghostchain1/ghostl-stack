// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/gns/GNSRegistry.sol";
import "../../src/gns/GNSResolver.sol";
import "../../src/gns/GNSNameWrapper.sol";
import "../../src/gns/GNSConstitutionGuard.sol";

// ────────────────────────────────────────────────────────────────────────────
// GNS full-suite Foundry tests
// ────────────────────────────────────────────────────────────────────────────

contract GNSTest is Test {
    GNSRegistry          registry;
    GNSResolver          resolver;
    GNSNameWrapper       wrapper;
    GNSConstitutionGuard guard;

    address governance = makeAddr("governance");
    address alice      = makeAddr("alice");
    address bob        = makeAddr("bob");
    address ghostBrain = makeAddr("ghostBrain");
    address bridge     = makeAddr("bridge");

    bytes32 ghostRoot;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public {
        vm.startPrank(governance);

        registry   = new GNSRegistry(governance);
        resolver   = new GNSResolver(address(registry));
        wrapper    = new GNSNameWrapper(address(registry));
        guard      = new GNSConstitutionGuard(address(registry), address(0), governance);

        guard.setGhostBrainCore(ghostBrain);
        registry.setL2Bridge(bridge);
        registry.setGuardian(address(guard));  // authorise guard to lock names

        ghostRoot = registry.GHOST_ROOT();

        vm.stopPrank();
    }

    // ── GNSRegistry ───────────────────────────────────────────────────────────
    function test_ghostRootIsLocked() public view {
        (, , , , bool locked) = registry.records(ghostRoot);
        assertTrue(locked, "ghost root must be locked");
    }

    function test_ghostRootOwnedByGovernance() public view {
        assertEq(registry.owner(ghostRoot), governance);
    }

    function test_registerName() public {
        bytes32 node = registry.nodeOf("alice");

        vm.prank(alice);
        registry.register("alice", alice, 365 days);

        assertEq(registry.owner(node), alice);
        assertFalse(registry.isExpired(node));
    }

    function test_cannotRegisterReservedLabel() public {
        vm.prank(alice);
        vm.expectRevert(GNSRegistry.RootLocked.selector);
        registry.register("validator", alice, 365 days);
    }

    function test_cannotRegisterTwice() public {
        vm.startPrank(alice);
        registry.register("alice", alice, 365 days);
        vm.expectRevert(GNSRegistry.AlreadyRegistered.selector);
        registry.register("alice", alice, 365 days);
        vm.stopPrank();
    }

    function test_transferName() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(alice);
        registry.transfer(node, bob);

        assertEq(registry.owner(node), bob);
    }

    function test_cannotTransferLockedName() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(governance);
        registry.lockName(node);

        vm.prank(alice);
        vm.expectRevert(GNSRegistry.Locked.selector);
        registry.transfer(node, bob);
    }

    function test_setResolver() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(alice);
        registry.setResolver(node, address(resolver));

        assertEq(registry.resolver(node), address(resolver));
    }

    function test_renewName() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        uint64 before = registry.expiry(node);

        vm.prank(alice);
        registry.renew(node, 365 days);

        assertGt(registry.expiry(node), before);
    }

    function test_bridgeRegister() public {
        bytes32 node = registry.nodeOf("bridgename");
        uint64  exp  = uint64(block.timestamp) + 365 days;

        vm.prank(bridge);
        registry.bridgeRegister(node, "bridgename", bob, exp);

        assertEq(registry.owner(node), bob);
        assertEq(registry.expiry(node), exp);
    }

    function test_minDurationEnforced() public {
        vm.prank(alice);
        vm.expectRevert(GNSRegistry.InvalidDuration.selector);
        registry.register("alice", alice, 1 days); // too short
    }

    function test_isAvailableAfterExpiry() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.warp(block.timestamp + 366 days);
        assertTrue(registry.isAvailable(node));
    }

    // ── GNSResolver ───────────────────────────────────────────────────────────
    function test_setAndGetAddress() public {
        bytes32 node = registry.nodeOf("alice");

        vm.startPrank(alice);
        registry.register("alice", alice, 365 days);
        registry.setResolver(node, address(resolver));
        resolver.setAddr(node, alice);
        vm.stopPrank();

        assertEq(resolver.addr(node), alice);
    }

    function test_setAndGetText() public {
        vm.startPrank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);
        registry.setResolver(node, address(resolver));

        resolver.setText(node, "avatar", "ipfs://Qm...");
        vm.stopPrank();

        assertEq(resolver.text(node, "avatar"), "ipfs://Qm...");
    }

    function test_unauthorisedResolverWrite() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(bob);
        vm.expectRevert(GNSResolver.NotAuthorised.selector);
        resolver.setAddr(node, bob);
    }

    // ── GNSNameWrapper ────────────────────────────────────────────────────────
    function test_wrapAndUnwrap() public {
        bytes32 node = registry.nodeOf("alice");

        vm.startPrank(alice);
        registry.register("alice", alice, 365 days);
        registry.setApproval(node, address(wrapper), true);  // allow wrapper to call transfer
        uint256 tokenId = wrapper.wrap(node, "alice");
        vm.stopPrank();

        assertEq(wrapper.ownerOf(tokenId), alice);
        // Registry ownership transferred to wrapper
        assertEq(registry.owner(node), address(wrapper));

        // Unwrap
        vm.prank(alice);
        wrapper.unwrap(node);

        assertEq(registry.owner(node), alice);
    }

    function test_wrapTransferAsNFT() public {
        bytes32 node = registry.nodeOf("alice");

        vm.startPrank(alice);
        registry.register("alice", alice, 365 days);
        registry.setApproval(node, address(wrapper), true);  // allow wrapper to call transfer
        uint256 tokenId = wrapper.wrap(node, "alice");
        wrapper.transferFrom(alice, bob, tokenId);
        vm.stopPrank();

        assertEq(wrapper.ownerOf(tokenId), bob);
    }

    function test_wrapRequiresRegistryOwnership() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(bob);
        vm.expectRevert(GNSNameWrapper.NotOwner.selector);
        wrapper.wrap(node, "alice");
    }

    // ── GNSConstitutionGuard ──────────────────────────────────────────────────
    function test_freezeAndLock() public {
        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        // GhostBrain freezes the name
        vm.prank(ghostBrain);
        guard.freezeName(node);

        assertTrue(guard.isFrozen(node));
        (, , , , bool locked) = registry.records(node);
        assertTrue(locked);
    }

    function test_constitutionalCheckReserved() public {
        bytes32 lh   = keccak256(bytes("validator"));
        bytes32 node = keccak256(abi.encodePacked(ghostRoot, lh));
        // reserved — this should revert
        vm.expectRevert(GNSConstitutionGuard.RootLocked.selector);
        guard.assertConstitutional(node, lh, "validator");
    }

    function test_validatorBinding() public {
        address staking = makeAddr("staking");
        vm.prank(governance);
        guard.setStakingContract(staking);

        vm.prank(alice);
        bytes32 node = registry.nodeOf("alice");
        registry.register("alice", alice, 365 days);

        vm.prank(staking);
        guard.bindValidator(1, node);

        assertEq(guard.validatorNode(1), node);
    }
}
