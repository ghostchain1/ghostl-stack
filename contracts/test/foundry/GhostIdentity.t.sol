// GhostChain Contracts v5.6.1 (test/foundry/GhostIdentity.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { GhostIdentity } from "../../src/l1/GhostIdentity.sol";

/// @title  GhostIdentityTest
/// @notice Comprehensive Foundry tests for GhostIdentity.sol (GhostChain L1, chain_id 14000101).
contract GhostIdentityTest is Test {
    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 constant L1_CHAIN_ID = 14_000_101;

    // ─── Actors ───────────────────────────────────────────────────────────────
    address owner    = makeAddr("owner");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");
    address oracle   = makeAddr("ghostBrainOracle");
    address attacker = makeAddr("attacker");

    GhostIdentity identity;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.chainId(L1_CHAIN_ID);
        vm.prank(owner);
        identity = new GhostIdentity(oracle);
    }

    // ─── Chain guard ──────────────────────────────────────────────────────────

    function test_wrongChain_register_reverts() public {
        vm.chainId(903); // L3 — not L1
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__WrongChain.selector,
                L1_CHAIN_ID,
                903
            )
        );
        vm.prank(alice);
        identity.register("djNova");
    }

    function test_wrongChain_transfer_reverts() public {
        // Register on L1 first
        vm.prank(alice);
        identity.register("djNova");

        vm.chainId(901); // L2 — not L1
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__WrongChain.selector,
                L1_CHAIN_ID,
                901
            )
        );
        vm.prank(alice);
        identity.transfer("djNova", bob);
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    function test_register_basic() public {
        vm.prank(alice);
        identity.register("djNova");

        assertEq(identity.resolve("djNova"), alice);
        assertEq(identity.reverseResolve(alice), "djnova");
        assertFalse(identity.isVerified("djNova"));
        assertTrue(identity.isTaken("djNova"));
        // Case-insensitive
        assertTrue(identity.isTaken("DJNOVA"));
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(false, true, false, false);
        emit GhostIdentity.IdentityRegistered("djnova", alice, "@djnova.ghost");
        vm.prank(alice);
        identity.register("djNova");
    }

    function test_register_ghostHandle() public {
        vm.prank(alice);
        identity.register("djNova");
        // ghostHandle view function
        assertEq(identity.ghostHandle("djNova"), "@djNova.ghost");
    }

    function test_register_duplicate_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__UsernameTaken.selector,
                "djNova"
            )
        );
        vm.prank(bob);
        identity.register("djNova");
    }

    function test_register_addressAlreadyRegistered_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        // Same address tries to register a second username
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__AddressAlreadyRegistered.selector,
                alice
            )
        );
        vm.prank(alice);
        identity.register("anotherName");
    }

    function test_register_empty_reverts() public {
        vm.expectRevert(GhostIdentity.GhostIdentity__EmptyUsername.selector);
        vm.prank(alice);
        identity.register("");
    }

    function test_register_tooLong_reverts() public {
        // 33 chars
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__UsernameTooLong.selector,
                33,
                32
            )
        );
        vm.prank(alice);
        identity.register("abcdefghijklmnopqrstuvwxyz1234567");
    }

    function test_register_invalidChar_reverts() public {
        vm.expectRevert(GhostIdentity.GhostIdentity__InvalidCharacter.selector);
        vm.prank(alice);
        identity.register("dj-Nova"); // hyphen not allowed
    }

    function test_register_invalidChar_dot_reverts() public {
        vm.expectRevert(GhostIdentity.GhostIdentity__InvalidCharacter.selector);
        vm.prank(alice);
        identity.register("ghost.user");
    }

    // ─── Resolve (unregistered) ───────────────────────────────────────────────

    function test_resolve_unregistered_returnsZero() public view {
        assertEq(identity.resolve("nobody"), address(0));
    }

    function test_reverseResolve_unregistered_returnsEmpty() public view {
        assertEq(bytes(identity.reverseResolve(alice)).length, 0);
    }

    // ─── Transfer ─────────────────────────────────────────────────────────────

    function test_transfer_basic() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.prank(alice);
        identity.transfer("djNova", bob);

        assertEq(identity.resolve("djNova"), bob);
        assertEq(identity.reverseResolve(bob), "djnova");
        // alice now has no username
        assertEq(bytes(identity.reverseResolve(alice)).length, 0);
    }

    function test_transfer_emitsEvent() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectEmit(false, true, true, false);
        emit GhostIdentity.IdentityTransferred("djnova", alice, bob);

        vm.prank(alice);
        identity.transfer("djNova", bob);
    }

    function test_transfer_notOwner_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__NotUsernameOwner.selector,
                "djNova",
                attacker
            )
        );
        vm.prank(attacker);
        identity.transfer("djNova", bob);
    }

    function test_transfer_toZeroAddress_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectRevert(GhostIdentity.GhostIdentity__TransferToZeroAddress.selector);
        vm.prank(alice);
        identity.transfer("djNova", address(0));
    }

    function test_transfer_toAlreadyRegisteredAddress_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.prank(bob);
        identity.register("ghostBob");

        // bob already has a username — transfer to bob should revert
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__AddressAlreadyRegistered.selector,
                bob
            )
        );
        vm.prank(alice);
        identity.transfer("djNova", bob);
    }

    // ─── Metadata URI ─────────────────────────────────────────────────────────

    function test_setMetadataURI_basic() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.prank(alice);
        identity.setMetadataURI("djNova", "ipfs://Qm1234567890");

        assertEq(identity.metadataURI("djNova"), "ipfs://Qm1234567890");
    }

    function test_setMetadataURI_notOwner_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__NotUsernameOwner.selector,
                "djNova",
                attacker
            )
        );
        vm.prank(attacker);
        identity.setMetadataURI("djNova", "ipfs://malicious");
    }

    function test_metadataURI_defaultEmpty() public {
        vm.prank(alice);
        identity.register("djNova");
        assertEq(bytes(identity.metadataURI("djNova")).length, 0);
    }

    // ─── Verification ─────────────────────────────────────────────────────────

    function test_setVerified_byOracle() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.prank(oracle);
        identity.setVerified("djNova", true);

        assertTrue(identity.isVerified("djNova"));
    }

    function test_setVerified_revoke() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.prank(oracle);
        identity.setVerified("djNova", true);
        assertTrue(identity.isVerified("djNova"));

        vm.prank(oracle);
        identity.setVerified("djNova", false);
        assertFalse(identity.isVerified("djNova"));
    }

    function test_setVerified_emitsEvent() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectEmit(false, true, false, true);
        emit GhostIdentity.CreatorVerified("djnova", alice, true);

        vm.prank(oracle);
        identity.setVerified("djNova", true);
    }

    function test_setVerified_notOracle_reverts() public {
        vm.prank(alice);
        identity.register("djNova");

        vm.expectRevert(GhostIdentity.GhostIdentity__NotGhostBrainOracle.selector);
        vm.prank(attacker);
        identity.setVerified("djNova", true);
    }

    function test_setVerified_usernameNotFound_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostIdentity.GhostIdentity__UsernameNotFound.selector,
                "ghost"
            )
        );
        vm.prank(oracle);
        identity.setVerified("ghost", true);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function test_setGhostBrainOracle() public {
        vm.prank(owner);
        identity.setGhostBrainOracle(carol);
        assertEq(identity.ghostBrainOracle(), carol);
    }

    function test_setGhostBrainOracle_notOwner_reverts() public {
        vm.expectRevert();
        vm.prank(attacker);
        identity.setGhostBrainOracle(attacker);
    }

    function test_pauseRegistrations() public {
        vm.prank(owner);
        identity.setRegistrationsPaused(true);
        assertTrue(identity.registrationsPaused());

        vm.expectRevert(GhostIdentity.GhostIdentity__Paused.selector);
        vm.prank(alice);
        identity.register("djNova");
    }

    function test_unpauseRegistrations() public {
        vm.prank(owner);
        identity.setRegistrationsPaused(true);

        vm.prank(owner);
        identity.setRegistrationsPaused(false);
        assertFalse(identity.registrationsPaused());

        // Registration now works again
        vm.prank(alice);
        identity.register("djNova");
        assertEq(identity.resolve("djNova"), alice);
    }

    // ─── Integration: register → transfer → verify ────────────────────────────

    function test_fullLifecycle() public {
        // 1. Alice registers
        vm.prank(alice);
        identity.register("cryptoQueen");
        assertEq(identity.resolve("cryptoQueen"), alice);

        // 2. Alice sets metadata
        vm.prank(alice);
        identity.setMetadataURI("cryptoQueen", "ipfs://QmProfile");
        assertEq(identity.metadataURI("cryptoQueen"), "ipfs://QmProfile");

        // 3. GhostBrain verifies
        vm.prank(oracle);
        identity.setVerified("cryptoQueen", true);
        assertTrue(identity.isVerified("cryptoQueen"));

        // 4. Alice transfers to bob
        vm.prank(alice);
        identity.transfer("cryptoQueen", bob);
        assertEq(identity.resolve("cryptoQueen"), bob);
        assertEq(identity.reverseResolve(bob), "cryptoqueen");
        assertEq(bytes(identity.reverseResolve(alice)).length, 0);

        // 5. Verification persists on the username (attached to key, not owner)
        assertTrue(identity.isVerified("cryptoQueen"));

        // 6. Alice can now register a new name
        vm.prank(alice);
        identity.register("aliceV2");
        assertEq(identity.resolve("aliceV2"), alice);
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    /// @dev Fuzz: valid username string (length 3-32, a-z0-9_) always registers.
    function testFuzz_register_validUsername(uint8 lenSeed) public {
        uint256 length = bound(uint256(lenSeed), 3, 32);
        bytes memory name = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            // Only lower-alpha chars so they always pass validation
            name[i] = bytes1(uint8(97 + (i % 26))); // a-z cycling
        }
        string memory username = string(name);

        vm.prank(alice);
        identity.register(username);
        assertEq(identity.resolve(username), alice);
    }
}
