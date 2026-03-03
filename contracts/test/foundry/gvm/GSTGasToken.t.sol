// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../../../src/gvm/GSTGasToken.sol";

contract GSTGasTokenTest is Test {
    // ─── Fixtures ────────────────────────────────────────────────────────────
    GSTGasToken internal gst;

    address internal bridge   = address(0xBB);
    address internal engine   = address(0xEE);
    address internal guardian = address(0xAA);
    address internal alice    = address(0xA11CE);
    address internal bob      = address(0xB0B);

    uint256 internal constant GVM_CHAIN   = 9001;
    uint256 internal constant L2_CHAIN    = 901;
    uint256 internal constant GENESIS_AMT = 1_000_000e18;

    // ─── Setup ───────────────────────────────────────────────────────────────
    function setUp() public {
        // Simulate GVM chain environment
        vm.chainId(GVM_CHAIN);

        address[] memory recipients = new address[](2);
        uint256[] memory amounts    = new uint256[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        amounts[0]    = GENESIS_AMT;
        amounts[1]    = GENESIS_AMT;

        gst = new GSTGasToken(bridge, engine, guardian, recipients, amounts);
    }

    // ─── Construction ────────────────────────────────────────────────────────
    function test_metadata() public view {
        assertEq(gst.name(),     "Ghost Gas Token");
        assertEq(gst.symbol(),   "GST");
        assertEq(gst.decimals(), 18);
        assertEq(gst.chainId(),  GVM_CHAIN);
        assertEq(gst.parentChainId(), L2_CHAIN);
    }

    function test_genesisAlloc() public view {
        assertEq(gst.balanceOf(alice), GENESIS_AMT);
        assertEq(gst.balanceOf(bob),   GENESIS_AMT);
        assertEq(gst.totalSupply(),    GENESIS_AMT * 2);
    }

    function test_roles() public view {
        assertTrue(gst.hasRole(gst.BRIDGE_ROLE(),   bridge));
        assertTrue(gst.hasRole(gst.ENGINE_ROLE(),   engine));
        assertTrue(gst.hasRole(gst.GUARDIAN_ROLE(), guardian));
    }

    function test_wrongChainReverts() public {
        vm.chainId(1); // Ethereum mainnet — must revert
        address[] memory r = new address[](0);
        uint256[] memory a = new uint256[](0);
        vm.expectRevert(abi.encodeWithSelector(GSTGasToken.WrongChain.selector, 1, GVM_CHAIN));
        new GSTGasToken(bridge, engine, guardian, r, a);
    }

    // ─── Bridge mint ─────────────────────────────────────────────────────────
    function test_bridgeMint_fromL2() public {
        uint256 amount = 500e18;
        vm.prank(bridge);
        gst.bridgeMint(alice, amount, L2_CHAIN);
        assertEq(gst.balanceOf(alice), GENESIS_AMT + amount);
    }

    function test_bridgeMint_wrongSourceReverts() public {
        // Routing law: source must be L2 (901), not L1 (14000101)
        vm.prank(bridge);
        vm.expectRevert(
            abi.encodeWithSelector(
                GSTGasToken.RoutingLawViolation.selector,
                "GSTGasToken: bridge source must be L2 (chainId 901)"
            )
        );
        gst.bridgeMint(alice, 100e18, 14000101);
    }

    function test_bridgeMint_unauthorizedReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GSTGasToken.Unauthorized.selector, alice, gst.BRIDGE_ROLE()));
        gst.bridgeMint(alice, 100e18, L2_CHAIN);
    }

    // ─── Engine mint ─────────────────────────────────────────────────────────
    function test_engineMint() public {
        uint256 reward = 2e18;
        vm.prank(engine);
        gst.engineMint(alice, reward);
        assertEq(gst.balanceOf(alice), GENESIS_AMT + reward);
    }

    function test_engineMint_capReverts() public {
        uint256 overCap = gst.MAX_SUPPLY() - gst.totalSupply() + 1;
        vm.prank(engine);
        vm.expectRevert(
            abi.encodeWithSelector(
                GSTGasToken.SupplyCapExceeded.selector,
                overCap,
                gst.MAX_SUPPLY() - gst.totalSupply()
            )
        );
        gst.engineMint(alice, overCap);
    }

    // ─── Bridge burn ─────────────────────────────────────────────────────────
    function test_bridgeBurn_toL2() public {
        uint256 amount = 200e18;
        vm.prank(bridge);
        gst.bridgeBurn(alice, amount, L2_CHAIN);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - amount);
    }

    function test_bridgeBurn_wrongDestReverts() public {
        vm.prank(bridge);
        vm.expectRevert(
            abi.encodeWithSelector(
                GSTGasToken.RoutingLawViolation.selector,
                "GSTGasToken: bridge destination must be L2 (chainId 901)"
            )
        );
        gst.bridgeBurn(alice, 100e18, 1); // L1 direct — forbidden
    }

    // ─── Self-burn ───────────────────────────────────────────────────────────
    function test_selfBurn() public {
        vm.prank(alice);
        gst.burn(100e18);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - 100e18);
    }

    // ─── Gas fee collection ───────────────────────────────────────────────────
    function test_collectGasFee() public {
        uint256 gasUsed  = 21_000;
        uint256 gasPrice = 1e9; // 1 gwei
        uint256 expected = gasUsed * gasPrice;

        vm.prank(engine);
        gst.collectGasFee(alice, gasUsed, gasPrice);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - expected);
    }

    // ─── ERC-20 transfers ────────────────────────────────────────────────────
    function test_transfer() public {
        vm.prank(alice);
        gst.transfer(bob, 100e18);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - 100e18);
        assertEq(gst.balanceOf(bob),   GENESIS_AMT + 100e18);
    }

    function test_transferFrom() public {
        vm.prank(alice);
        gst.approve(address(this), 50e18);
        gst.transferFrom(alice, bob, 50e18);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - 50e18);
    }

    // ─── Pause ───────────────────────────────────────────────────────────────
    function test_pause_blocksTransfer() public {
        vm.prank(guardian);
        gst.pause("security incident");

        vm.prank(alice);
        vm.expectRevert(GSTGasToken.GSTIsPaused.selector);
        gst.transfer(bob, 1e18);
    }

    function test_unpause() public {
        vm.prank(guardian);
        gst.pause("test");
        vm.prank(guardian);
        gst.unpause();
        assertFalse(gst.paused());

        vm.prank(alice);
        gst.transfer(bob, 1e18); // should not revert
    }

    // ─── Role management ──────────────────────────────────────────────────────
    function test_grantRevoke() public {
        address newBridge = address(0xCC);
        vm.prank(guardian);
        gst.grantRole(gst.BRIDGE_ROLE(), newBridge);
        assertTrue(gst.hasRole(gst.BRIDGE_ROLE(), newBridge));

        vm.prank(guardian);
        gst.revokeRole(gst.BRIDGE_ROLE(), newBridge);
        assertFalse(gst.hasRole(gst.BRIDGE_ROLE(), newBridge));
    }

    function test_grantRole_unauthorizedReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GSTGasToken.Unauthorized.selector, alice, gst.GUARDIAN_ROLE()));
        gst.grantRole(gst.BRIDGE_ROLE(), alice);
    }

    // ─── Remaining supply ────────────────────────────────────────────────────
    function test_remainingSupply() public view {
        assertEq(gst.remainingSupply(), gst.MAX_SUPPLY() - gst.totalSupply());
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────
    function testFuzz_transferCommutative(uint128 amount) public {
        vm.assume(amount > 0 && amount <= GENESIS_AMT);
        vm.prank(alice);
        gst.transfer(bob, amount);
        assertEq(gst.balanceOf(alice) + gst.balanceOf(bob), GENESIS_AMT * 2);
    }

    function testFuzz_gasFeeBounded(uint64 gasUsed, uint32 gasPrice) public {
        vm.assume(gasUsed > 0 && gasPrice > 0);
        uint256 cost = uint256(gasUsed) * uint256(gasPrice);
        vm.assume(cost <= GENESIS_AMT);
        vm.prank(engine);
        gst.collectGasFee(alice, gasUsed, gasPrice);
        assertEq(gst.balanceOf(alice), GENESIS_AMT - cost);
    }
}
