// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TestBase.sol";
import "../../src/constitution/GhostIdentityConstitution.sol";

contract GhostIdentityConstitutionTest is TestBase {
    GhostIdentityConstitution internal c;

    function setUp() public {
        c = new GhostIdentityConstitution(address(this));
    }

    function testIdentityMatchesGhost() public {
        assertTrue(c.verifyIdentity("Ghost", "GST", 18), "canonical identity should match");
    }

    function testIdentityRejectsWrongName() public {
        assertEq(c.verifyIdentity("Ghost Token", "GST", 18), false, "wrong name must fail");
    }

    function testIdentityRejectsETHSymbol() public {
        assertEq(c.verifyIdentity("Ghost", "ETH", 18), false, "ETH symbol must fail");
    }

    function testIdentityRejectsWrongDecimals() public {
        assertEq(c.verifyIdentity("Ghost", "GST", 17), false, "wrong decimals must fail");
    }

    function testRequireIdentityPassesForCanonical() public view {
        c.requireIdentity("Ghost", "GST", 18);
    }

    function testRequireIdentityRevertsForETH() public {
        vm.expectRevert(abi.encodeWithSelector(GhostIdentityConstitution.InvalidIdentity.selector, "symbol"));
        c.requireIdentity("Ghost", "ETH", 18);
    }

    function testRequireIdentityRevertsForWrongName() public {
        vm.expectRevert(abi.encodeWithSelector(GhostIdentityConstitution.InvalidIdentity.selector, "name"));
        c.requireIdentity("Ethereum", "GST", 18);
    }

    function testGovernorSetsSystemContract() public {
        bytes32 key = keccak256("TREASURY");
        c.setSystemContract(key, address(0xBEEF));
        assertEq(c.systemContracts(key), address(0xBEEF), "system contract should be registered");
    }

    function testNonGovernorCannotSetSystemContract() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(GhostIdentityConstitution.NotGovernor.selector);
        c.setSystemContract(keccak256("TREASURY"), address(0xBEEF));
    }

    function testZeroGovernorRevertsInConstructor() public {
        vm.expectRevert(GhostIdentityConstitution.ZeroAddress.selector);
        new GhostIdentityConstitution(address(0));
    }

    function testConstantsAreCanonical() public view {
        assertEq(c.NATIVE_NAME(),    "Ghost",      "name mismatch");
        assertEq(c.NATIVE_SYMBOL(),  "GST",        "symbol mismatch");
        assertEq(c.NATIVE_DECIMALS(), uint8(18),   "decimals mismatch");
        assertEq(c.L1_NAME(),        "GhostChain", "L1 name mismatch");
        assertEq(c.L2_NAME(),        "GhostL2",    "L2 name mismatch");
        assertEq(c.L3_NAME(),        "GhostL3",    "L3 name mismatch");
        assertEq(c.L1_CHAIN_ID(),    uint256(14000101), "L1 chainId mismatch");
        assertEq(c.L2_CHAIN_ID(),    uint256(901),      "L2 chainId mismatch");
        assertEq(c.L3_CHAIN_ID(),    uint256(903),      "L3 chainId mismatch");
    }

    function testIdentityHashMatchesExpected() public view {
        bytes32 expected = keccak256(
            abi.encodePacked(
                "GhostStackIdentity:v1|",
                "name=Ghost|",
                "symbol=GST|",
                "decimals=18|",
                "L1=GhostChain|",
                "L2=GhostL2|",
                "L3=GhostL3"
            )
        );
        assertEq(c.IDENTITY_HASH(), expected, "IDENTITY_HASH mismatch");
        assertEq(c.getIdentityHash(), expected, "getIdentityHash() mismatch");
    }

    // ── Helpers re-implemented (TestBase doesn't have all asserts) ─────────────

    function assertEq(bool a, bool b, string memory msg) internal {
        require(a == b, msg);
    }

    function assertEq(string memory a, string memory b, string memory msg) internal {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), msg);
    }

    function assertEq(uint8 a, uint8 b, string memory msg) internal {
        require(a == b, msg);
    }
}
