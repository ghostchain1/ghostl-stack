// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (test/foundry/GhostSwap.t.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/tokens/WGST9.sol";
import "../../src/tokens/WGST10.sol";
import "../../src/ghostswap/GhostFactory.sol";
import "../../src/ghostswap/GhostPair.sol";
import "../../src/ghostswap/GhostRouter.sol";
import "../../src/tokens/TestGST20.sol";

/// @title GhostSwap
/// @notice Forge test suite for the GhostSwap AMM DeFi core:
///         WGST9, WGST10, GhostFactory, GhostPair, GhostRouter.
///
///         Each section is clearly delimited.  Test names follow the pattern:
///           test_<unit>_<behaviour>   → unit / happy-path
///           testFail_<unit>_<reason>  → expected revert (Foundry older style)
///           testRevert_<unit>_<cond>  → expected revert (vm.expectRevert style)
contract GhostSwap is TestBase {

    // ─────────────────────── Actors ──────────────────────────────────────────

    address internal alice = address(0xA11CE);
    address internal bob   = address(0xB0B);

    // ─────────────────────── Contracts ───────────────────────────────────────

    WGST9        internal wgst9;
    WGST10       internal wgst10;
    GhostFactory internal factory;
    GhostRouter  internal router;
    TestGST20    internal tokenA;
    TestGST20    internal tokenB;

    // ─────────────────────── Setup ───────────────────────────────────────────

    function setUp() public {
        // Fund actors with native GST.
        vm.deal(alice,         100 ether);
        vm.deal(bob,           100 ether);
        vm.deal(address(this), 200_000 ether); // enough for GST liquidity bootstrap tests

        // Deploy core contracts.
        wgst9   = new WGST9();
        wgst10  = new WGST10();
        factory = new GhostFactory(address(this)); // this = feeToSetter
        router  = new GhostRouter(address(factory), address(wgst9));

        // Deploy two test GRC-20 tokens.
        tokenA = new TestGST20("Alpha", "ALPHA", 18);
        tokenB = new TestGST20("Beta",  "BETA",  18);

        // Mint generous supplies to alice and this contract.
        tokenA.mint(alice,          500_000 ether);
        tokenB.mint(alice,          500_000 ether);
        tokenA.mint(address(this),  500_000 ether);
        tokenB.mint(address(this),  500_000 ether);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // WGST9
    // ═════════════════════════════════════════════════════════════════════════

    function test_wgst9_deposit() public {
        uint256 amount  = 5 ether;
        uint256 before  = address(this).balance;

        wgst9.deposit{value: amount}();

        assertEq(wgst9.balanceOf(address(this)), amount,  "WGST9: balance after deposit");
        assertEq(wgst9.totalSupply(),            amount,  "WGST9: totalSupply == balance");
        assertEq(address(this).balance,          before - amount, "WGST9: native GST deducted");
    }

    function test_wgst9_depositViaReceive() public {
        uint256 amount = 3 ether;
        // Direct value transfer triggers receive() → deposit().
        (bool ok,) = address(wgst9).call{value: amount}("");
        require(ok, "direct send failed");
        assertEq(wgst9.balanceOf(address(this)), amount, "WGST9: receive deposit");
    }

    function test_wgst9_withdraw() public {
        uint256 amount = 7 ether;
        wgst9.deposit{value: amount}();

        uint256 nativeBefore = address(this).balance;
        wgst9.withdraw(amount);

        assertEq(wgst9.balanceOf(address(this)), 0,            "WGST9: balance after withdraw");
        assertEq(wgst9.totalSupply(),            0,            "WGST9: totalSupply after withdraw");
        assertEq(address(this).balance,          nativeBefore + amount, "WGST9: native GST returned");
    }

    function test_wgst9_transfer() public {
        wgst9.deposit{value: 10 ether}();
        assertTrue(wgst9.transfer(alice, 4 ether), "WGST9: transfer return");
        assertEq(wgst9.balanceOf(alice),          4 ether, "WGST9: alice balance");
        assertEq(wgst9.balanceOf(address(this)),  6 ether, "WGST9: sender balance");
    }

    function test_wgst9_approve_transferFrom() public {
        wgst9.deposit{value: 10 ether}();
        assertTrue(wgst9.approve(alice, 5 ether), "WGST9: approve");
        assertEq(wgst9.allowance(address(this), alice), 5 ether, "WGST9: allowance");

        vm.prank(alice);
        assertTrue(wgst9.transferFrom(address(this), bob, 3 ether), "WGST9: transferFrom");
        assertEq(wgst9.balanceOf(bob),           3 ether, "WGST9: bob received");
        assertEq(wgst9.allowance(address(this), alice), 2 ether, "WGST9: allowance decremented");
    }

    function test_wgst9_infiniteApproval() public {
        wgst9.deposit{value: 10 ether}();
        wgst9.approve(alice, type(uint256).max);

        vm.prank(alice);
        wgst9.transferFrom(address(this), bob, 5 ether);

        // Infinite allowance must NOT be decremented.
        assertEq(wgst9.allowance(address(this), alice), type(uint256).max, "WGST9: max stays max");
    }

    function testRevert_wgst9_withdrawInsufficient() public {
        wgst9.deposit{value: 1 ether}();
        vm.expectRevert(bytes("WGST: insufficient balance"));
        wgst9.withdraw(2 ether);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // WGST10 — basic surface + sanity checks
    // ═════════════════════════════════════════════════════════════════════════

    function test_wgst10_depositAndWithdraw() public {
        wgst10.deposit{value: 5 ether}();
        assertEq(wgst10.balanceOf(address(this)), 5 ether, "WGST10: deposit");

        wgst10.withdraw(5 ether);
        assertEq(wgst10.balanceOf(address(this)), 0,       "WGST10: withdraw");
    }

    function test_wgst10_metadata() public {
        assertEq(wgst10.name(),     "Wrapped Ghost", "WGST10: name");
        assertEq(wgst10.symbol(),   "WGST",          "WGST10: symbol");
        assertEq(wgst10.decimals(), 18,              "WGST10: decimals");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostFactory
    // ═════════════════════════════════════════════════════════════════════════

    function test_factory_createPair() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertTrue(pair != address(0), "Factory: pair created");
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair, "Factory: getPair A->B");
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair, "Factory: getPair B->A");
        assertEq(factory.allPairsLength(), 1, "Factory: allPairsLength");
    }

    function test_factory_createPair_sortOrder() public {
        // Ensure token0 < token1 regardless of input order.
        address pair1 = factory.createPair(address(tokenA), address(tokenB));
        address t0 = GhostPair(pair1).token0();
        address t1 = GhostPair(pair1).token1();
        assertTrue(t0 < t1, "Factory: token0 < token1");
    }

    function testRevert_factory_duplicatePair() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert(bytes("GhostFactory: pair exists"));
        factory.createPair(address(tokenA), address(tokenB));
    }

    function testRevert_factory_identicalTokens() public {
        vm.expectRevert(bytes("GhostFactory: identical tokens"));
        factory.createPair(address(tokenA), address(tokenA));
    }

    function testRevert_factory_zeroAddress() public {
        vm.expectRevert(bytes("GhostFactory: zero address"));
        factory.createPair(address(0), address(tokenA));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostPair — addLiquidity (via router → pair.mint)
    // ═════════════════════════════════════════════════════════════════════════

    function test_pair_addLiquidity_initial() public {
        // Create pair.
        factory.createPair(address(tokenA), address(tokenB));
        address pair = factory.getPair(address(tokenA), address(tokenB));

        uint256 amtA = 100_000 ether;
        uint256 amtB = 200_000 ether;

        // Approve router.
        tokenA.approve(address(router), amtA);
        tokenB.approve(address(router), amtB);

        (uint256 usedA, uint256 usedB, uint256 lp) = router.addLiquidity(
            address(tokenA),
            address(tokenB),
            amtA,
            amtB,
            0,
            0,
            address(this),
            block.timestamp + 60
        );

        assertTrue(usedA > 0,          "Pair: usedA > 0");
        assertTrue(usedB > 0,          "Pair: usedB > 0");
        assertTrue(lp > 0,             "Pair: LP tokens minted");

        assertEq(GhostPair(pair).balanceOf(address(this)), lp, "Pair: LP balance");

        (uint112 r0, uint112 r1,) = GhostPair(pair).getReserves();
        assertTrue(r0 > 0 && r1 > 0, "Pair: reserves set");
    }

    function test_pair_addLiquidity_subsequent() public {
        // First deposit (price discovery).
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        router.addLiquidity(
            address(tokenA), address(tokenB),
            100_000 ether, 100_000 ether,
            0, 0, address(this), block.timestamp + 60
        );

        uint256 lpBefore = GhostPair(factory.getPair(address(tokenA), address(tokenB)))
            .balanceOf(address(this));

        // Second deposit — proportional.
        (,, uint256 lp2) = router.addLiquidity(
            address(tokenA), address(tokenB),
            50_000 ether, 50_000 ether,
            0, 0, address(this), block.timestamp + 60
        );

        assertTrue(lp2 > 0, "Pair: second deposit LP > 0");
        assertEq(
            GhostPair(factory.getPair(address(tokenA), address(tokenB))).balanceOf(address(this)),
            lpBefore + lp2,
            "Pair: LP accumulates"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostRouter — swaps
    // ═════════════════════════════════════════════════════════════════════════

    function _bootstrapPool() internal returns (address pair) {
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB),
            100_000 ether, 100_000 ether,
            0, 0, address(this), block.timestamp + 60
        );
        pair = factory.getPair(address(tokenA), address(tokenB));
    }

    function test_router_swapExactTokensForTokens() public {
        _bootstrapPool();

        uint256 amountIn = 1_000 ether;
        tokenA.mint(alice, amountIn);

        vm.prank(alice);
        tokenA.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256 balBefore = tokenB.balanceOf(alice);

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn, 0, path, alice, block.timestamp + 60
        );

        assertTrue(amounts[amounts.length - 1] > 0,          "Router: output > 0");
        assertEq(tokenB.balanceOf(alice), balBefore + amounts[1], "Router: alice received tokenB");
    }

    function test_router_swapExactTokensForTokens_multiHop() public {
        // A → B → WGST9   (two-hop path)
        // First, create A/B pool.
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB),
            100_000 ether, 100_000 ether,
            0, 0, address(this), block.timestamp + 60
        );

        // Then B/WGST pool.
        wgst9.deposit{value: 50_000 ether}();
        wgst9.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenB), address(wgst9),
            100_000 ether, 50_000 ether,
            0, 0, address(this), block.timestamp + 60
        );

        uint256 amountIn = 500 ether;
        tokenA.mint(alice, amountIn);
        vm.prank(alice);
        tokenA.approve(address(router), amountIn);

        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(wgst9);

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn, 0, path, alice, block.timestamp + 60
        );

        assertTrue(amounts[2] > 0, "Router: multiHop output > 0");
        assertEq(wgst9.balanceOf(alice), amounts[2], "Router: alice received WGST");
    }

    function testRevert_router_swapSlippageExceeded() public {
        _bootstrapPool();

        uint256 amountIn = 1_000 ether;
        tokenA.mint(alice, amountIn);
        vm.prank(alice);
        tokenA.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        // Require way more output than possible.
        vm.prank(alice);
        vm.expectRevert(bytes("GhostRouter: INSUFFICIENT_OUTPUT"));
        router.swapExactTokensForTokens(
            amountIn, type(uint256).max, path, alice, block.timestamp + 60
        );
    }

    function testRevert_router_deadlineExpired() public {
        _bootstrapPool();
        tokenA.mint(alice, 1 ether);
        vm.prank(alice);
        tokenA.approve(address(router), 1 ether);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        vm.prank(alice);
        vm.expectRevert(bytes("GhostRouter: EXPIRED"));
        router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp - 1);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostRouter — native GST swaps (WGST wrapping)
    // ═════════════════════════════════════════════════════════════════════════

    function test_router_addLiquidityGST() public {
        tokenA.approve(address(router), type(uint256).max);
        uint256 gstAmount = 10 ether;

        (, uint256 amtGST, uint256 lp) = router.addLiquidityGST{value: gstAmount}(
            address(tokenA),
            20_000 ether,
            0,
            0,
            address(this),
            block.timestamp + 60
        );

        assertTrue(lp > 0,         "Router: GST LP minted");
        assertTrue(amtGST > 0,     "Router: GST amount used");

        // Verify WGST is in the pair (not stuck in router).
        address pair = factory.getPair(address(tokenA), address(wgst9));
        assertTrue(pair != address(0), "Router: GST pair created");
        assertEq(wgst9.balanceOf(address(router)), 0, "Router: no WGST residue");
    }

    function test_router_swapExactGSTForTokens() public {
        // Bootstrap tokenA/WGST pool.
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityGST{value: 50_000 ether}(
            address(tokenA),
            100_000 ether,
            0, 0,
            address(this),
            block.timestamp + 60
        );

        address[] memory path = new address[](2);
        path[0] = address(wgst9);
        path[1] = address(tokenA);

        uint256 beforeA = tokenA.balanceOf(alice);
        vm.prank(alice);
        uint256[] memory amounts = router.swapExactGSTForTokens{value: 1 ether}(
            0, path, alice, block.timestamp + 60
        );

        assertTrue(amounts[1] > 0, "Router: GST->token output");
        assertEq(tokenA.balanceOf(alice), beforeA + amounts[1], "Router: alice received tokenA");
    }

    function test_router_swapExactTokensForGST() public {
        // Bootstrap tokenA/WGST pool.
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityGST{value: 50_000 ether}(
            address(tokenA),
            100_000 ether,
            0, 0,
            address(this),
            block.timestamp + 60
        );

        uint256 amountIn = 2_000 ether;
        tokenA.mint(alice, amountIn);
        vm.prank(alice);
        tokenA.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(wgst9);

        uint256 nativeBefore = alice.balance;
        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForGST(
            amountIn, 0, path, alice, block.timestamp + 60
        );

        assertTrue(amounts[1] > 0, "Router: token->GST output");
        assertEq(alice.balance, nativeBefore + amounts[1], "Router: alice received native GST");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostRouter — remove liquidity
    // ═════════════════════════════════════════════════════════════════════════

    function test_router_removeLiquidity() public {
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        (,, uint256 lp) = router.addLiquidity(
            address(tokenA), address(tokenB),
            100_000 ether, 100_000 ether, 0, 0,
            address(this), block.timestamp + 60
        );

        address pair = factory.getPair(address(tokenA), address(tokenB));
        GhostPair(pair).approve(address(router), lp);

        uint256 aaBefore = tokenA.balanceOf(address(this));
        uint256 abBefore = tokenB.balanceOf(address(this));

        (uint256 retA, uint256 retB) = router.removeLiquidity(
            address(tokenA), address(tokenB),
            lp, 0, 0, address(this), block.timestamp + 60
        );

        assertTrue(retA > 0, "Router: removeLiquidity returned tokenA");
        assertTrue(retB > 0, "Router: removeLiquidity returned tokenB");
        assertEq(tokenA.balanceOf(address(this)), aaBefore + retA, "Router: tokenA returned");
        assertEq(tokenB.balanceOf(address(this)), abBefore + retB, "Router: tokenB returned");
        assertEq(GhostPair(pair).balanceOf(address(this)), 0, "Router: LP burned");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostRouter — quote / getAmountOut
    // ═════════════════════════════════════════════════════════════════════════

    function test_router_quote() public {
        uint256 q = router.quote(100 ether, 1_000 ether, 2_000 ether);
        assertEq(q, 200 ether, "Router: quote proportional");
    }

    function test_router_getAmountOut_fee() public {
        // 0.3% fee: 1000 input, 1000/1000 pool → after fee should be < 500.
        uint256 out = router.getAmountOut(1_000 ether, 1_000_000 ether, 1_000_000 ether);
        // roughly: out = 997*1e18 / (1000000e18*1000 + 997*1e18) * 1000000e18
        // just verify it's > 0 and < input (fee taken).
        assertTrue(out > 0,           "Router: getAmountOut > 0");
        assertTrue(out < 1_000 ether, "Router: fee deducted");
    }

    function testFuzz_router_getAmountOut_monotone(uint96 amtIn) public {
        if (amtIn == 0) return;
        uint256 amountIn = uint256(amtIn);
        uint256 reserveIn  = 1_000_000 ether;
        uint256 reserveOut = 1_000_000 ether;
        if (amountIn >= reserveIn) return; // skip unrealistic inputs

        uint256 out1 = router.getAmountOut(amountIn,     reserveIn, reserveOut);
        uint256 out2 = router.getAmountOut(amountIn + 1, reserveIn, reserveOut);
        assertTrue(out2 >= out1, "Router: getAmountOut monotone in input");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GhostFactory — setFeeTo governance
    // ═════════════════════════════════════════════════════════════════════════

    function test_factory_setFeeTo() public {
        factory.setFeeTo(alice);
        assertEq(factory.feeTo(), alice, "Factory: feeTo set");
    }

    function testRevert_factory_setFeeTo_notSetter() public {
        vm.prank(alice);
        vm.expectRevert(bytes("GhostFactory: forbidden"));
        factory.setFeeTo(alice);
    }

    function test_factory_setFeeToSetter() public {
        factory.setFeeToSetter(alice);
        assertEq(factory.feeToSetter(), alice, "Factory: feeToSetter updated");
    }
}
