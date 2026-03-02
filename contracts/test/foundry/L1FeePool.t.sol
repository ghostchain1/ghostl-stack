// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {L1AIFeePool} from "../../src/l1/L1AIFeePool.sol";
import {GSTCrossChainAdapter} from "../../src/bridge/GSTCrossChainAdapter.sol";
import {FeeInvestmentManager} from "../../src/ai/FeeInvestmentManager.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mock ERC-20
// ─────────────────────────────────────────────────────────────────────────────

contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory _name, string memory _sym) {
        name   = _name;
        symbol = _sym;
    }

    function mint(address to, uint256 amount) external {
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock bridge (records calls for assertion)
// ─────────────────────────────────────────────────────────────────────────────

contract MockBridge {
    struct Call {
        address localToken;
        address remoteToken;
        address to;
        uint256 amount;
        uint32  minGasLimit;
        bytes   extraData;
    }
    Call[] public calls;

    function bridgeERC20To(
        address localToken,
        address remoteToken,
        address to,
        uint256 amount,
        uint32  minGasLimit,
        bytes calldata extraData
    ) external {
        calls.push(Call(localToken, remoteToken, to, amount, minGasLimit, extraData));
    }

    function callCount() external view returns (uint256) { return calls.length; }
}

// ─────────────────────────────────────────────────────────────────────────────
// L1AIFeePool tests
// ─────────────────────────────────────────────────────────────────────────────

contract L1AIFeePoolTest is Test {
    MockERC20    gst;
    MockERC20    usdc;
    L1AIFeePool  pool;

    address governor    = address(0xA1);
    address feeRecip    = address(0xA2);
    address feeManager  = address(0xA3);
    address alice       = address(0xA4);
    address bob         = address(0xA5);

    function setUp() public {
        gst  = new MockERC20("Ghost Token", "GST");
        usdc = new MockERC20("USD Coin",    "USDC");

        vm.prank(governor);
        pool = new L1AIFeePool(
            address(gst), address(usdc),
            governor, address(0),
            feeRecip, feeManager
        );

        // Fund alice and bob
        gst.mint(alice, 1_000_000e18);
        usdc.mint(alice, 1_000_000e18);
        gst.mint(bob,   1_000_000e18);
        usdc.mint(bob,   1_000_000e18);
    }

    // ── addLiquidity ─────────────────────────────────────────────────────────

    function test_addLiquidity_firstDeposit() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        uint256 shares = pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        assertGt(shares, 0, "should receive LP shares");
        assertGt(pool.totalShares(), pool.MIN_LIQUIDITY(), "total shares > dead shares");
        assertGt(pool.reserve0(), 0, "reserve0 set");
        assertGt(pool.reserve1(), 0, "reserve1 set");
    }

    function test_addLiquidity_secondDeposit_proportional() public {
        // Alice seeds the pool
        vm.startPrank(alice);
        gst.approve(address(pool), 200_000e18);
        usdc.approve(address(pool), 200_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);

        // Alice adds more
        uint256 shares2 = pool.addLiquidity(10_000e18, 10_000e18);
        vm.stopPrank();

        assertGt(shares2, 0, "second deposit yields shares");
    }

    function test_addLiquidity_revertOnZero() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100e18);
        vm.expectRevert("L1AIFeePool: zero amount");
        pool.addLiquidity(0, 100e18);
        vm.stopPrank();
    }

    // ── removeLiquidity ──────────────────────────────────────────────────────

    function test_removeLiquidity_returnsTokens() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        uint256 lpShares = pool.addLiquidity(100_000e18, 100_000e18);

        uint256 gstBefore = gst.balanceOf(alice);
        (uint256 gstOut, uint256 pairedOut) = pool.removeLiquidity(lpShares / 2);
        vm.stopPrank();

        assertGt(gstOut,    0, "gst returned");
        assertGt(pairedOut, 0, "paired returned");
        assertGt(gst.balanceOf(alice), gstBefore, "alice received gst");
    }

    function test_removeLiquidity_revertInsufficientShares() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);

        vm.expectRevert("L1AIFeePool: insufficient shares");
        pool.removeLiquidity(type(uint256).max);
        vm.stopPrank();
    }

    // ── swap ─────────────────────────────────────────────────────────────────

    function test_swap_gstForPaired() public {
        // Seed pool
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        // Bob swaps
        uint256 swapIn = 1_000e18;
        vm.startPrank(bob);
        gst.approve(address(pool), swapIn);
        uint256 usdcBefore = usdc.balanceOf(bob);
        uint256 amountOut  = pool.swap(address(gst), swapIn, 0);
        vm.stopPrank();

        assertGt(amountOut, 0, "got usdc out");
        assertEq(usdc.balanceOf(bob), usdcBefore + amountOut, "usdc balance increased");
    }

    function test_swap_revertBadToken() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        vm.expectRevert("L1AIFeePool: invalid token");
        pool.swap(address(0xDEAD), 1e18, 0);
        vm.stopPrank();
    }

    function test_swap_slippageProtection() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        gst.approve(address(pool), 1_000e18);
        vm.expectRevert("L1AIFeePool: slippage");
        pool.swap(address(gst), 1_000e18, type(uint256).max);
        vm.stopPrank();
    }

    // ── collectProtocolFees ──────────────────────────────────────────────────

    function test_collectProtocolFees_accruesToLPs() public {
        // Seed pool
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        // Fee manager injects protocol fees
        gst.mint(feeManager, 10_000e18);
        vm.startPrank(feeManager);
        gst.approve(address(pool), 10_000e18);
        pool.collectProtocolFees(10_000e18, 0);
        vm.stopPrank();

        (uint256 pendingGst,) = pool.pendingRewards(alice);
        assertGt(pendingGst, 0, "alice has pending gst rewards");
    }

    function test_collectProtocolFees_revertIfNotFeeManager() public {
        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        vm.expectRevert("L1AIFeePool: not fee manager");
        pool.collectProtocolFees(1e18, 0);
        vm.stopPrank();
    }

    // ── governance ───────────────────────────────────────────────────────────

    function test_governance_setSwapFee() public {
        vm.prank(governor);
        pool.setSwapFeeBps(50);
        assertEq(pool.swapFeeBps(), 50);
    }

    function test_governance_setSwapFeeRevertTooHigh() public {
        vm.prank(governor);
        vm.expectRevert("L1AIFeePool: fee too high");
        pool.setSwapFeeBps(201);
    }

    function test_pause_blocksLiquidity() public {
        vm.prank(governor);
        pool.setPaused(true);

        vm.startPrank(alice);
        gst.approve(address(pool), 100_000e18);
        usdc.approve(address(pool), 100_000e18);
        vm.expectRevert("L1AIFeePool: paused");
        pool.addLiquidity(100_000e18, 100_000e18);
        vm.stopPrank();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTCrossChainAdapter tests
// ─────────────────────────────────────────────────────────────────────────────

contract GSTCrossChainAdapterTest is Test {
    MockERC20             gst;
    MockBridge            bridge;
    GSTCrossChainAdapter  adapter;

    address governor   = address(0xB1);
    address feeManager = address(0xB2);
    address oracle     = address(0xB3);

    uint256 constant ETH_MAINNET = 1;
    address constant REMOTE_GST  = address(0xC001);

    function setUp() public {
        gst    = new MockERC20("Ghost Token", "GST");
        bridge = new MockBridge();

        vm.prank(governor);
        adapter = new GSTCrossChainAdapter(
            address(gst), governor, address(0), feeManager
        );

        // Register Ethereum mainnet
        vm.prank(governor);
        adapter.addChain(
            ETH_MAINNET,
            address(bridge),
            REMOTE_GST,
            oracle,
            1_000_000e18,
            "Ethereum Mainnet"
        );
    }

    function test_addChain_registered() public view {
        (bool active, address br,,,,,,) = _chainCfg(ETH_MAINNET);
        assertTrue(active, "chain should be active");
        assertEq(br, address(bridge), "bridge address matches");
    }

    function test_deployToChain_basicFlow() public {
        uint256 amount = 10_000e18;
        gst.mint(feeManager, amount);

        vm.startPrank(feeManager);
        gst.approve(address(adapter), amount);
        adapter.deployToChain(ETH_MAINNET, amount, 200_000, bytes32(0));
        vm.stopPrank();

        assertEq(bridge.callCount(), 1, "bridge called once");
        (,,,,, uint256 deployed,,) = _chainCfg(ETH_MAINNET);
        assertEq(deployed, amount, "deployed amount tracked");
    }

    function test_deployToChain_revertUnknownChain() public {
        gst.mint(feeManager, 1e18);
        vm.startPrank(feeManager);
        gst.approve(address(adapter), 1e18);
        vm.expectRevert(abi.encodeWithSelector(GSTCrossChainAdapter.UnknownChain.selector, 999));
        adapter.deployToChain(999, 1e18, 200_000, bytes32(0));
        vm.stopPrank();
    }

    function test_deployToChain_revertCapExceeded() public {
        uint256 overCap = 2_000_000e18;
        gst.mint(feeManager, overCap);
        vm.startPrank(feeManager);
        gst.approve(address(adapter), overCap);
        vm.expectRevert();
        adapter.deployToChain(ETH_MAINNET, overCap, 200_000, bytes32("GUARDIAN"));
        vm.stopPrank();
    }

    function test_deployToChain_revertAttestationRequired() public {
        uint256 bigAmount = adapter.singleBridgeCap() + 1e18;
        // Update max deployment to allow this amount
        vm.prank(governor);
        adapter.setMaxDeployment(ETH_MAINNET, bigAmount * 2);

        gst.mint(feeManager, bigAmount);
        vm.startPrank(feeManager);
        gst.approve(address(adapter), bigAmount);
        vm.expectRevert(GSTCrossChainAdapter.AttestationRequired.selector);
        adapter.deployToChain(ETH_MAINNET, bigAmount, 200_000, bytes32(0));
        vm.stopPrank();
    }

    function test_recordYield_byOracle() public {
        vm.prank(oracle);
        adapter.recordYield(ETH_MAINNET, 500e18, bytes32("ATTEST_HASH"));

        (,,,,,, uint256 cumYield,) = _chainCfg(ETH_MAINNET);
        assertEq(cumYield, 500e18, "cumulative yield updated");
        assertEq(adapter.totalCumulativeYield(), 500e18);
    }

    function test_recordYield_revertNotOracle() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        adapter.recordYield(ETH_MAINNET, 1e18, bytes32(0));
    }

    function test_deactivateChain() public {
        vm.prank(governor);
        adapter.deactivateChain(ETH_MAINNET);
        (bool active,,,,,,,) = _chainCfg(ETH_MAINNET);
        assertFalse(active, "chain deactivated");
    }

    function test_chainCount() public view {
        assertEq(adapter.chainCount(), 1);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _chainCfg(uint256 chainId)
        internal
        view
        returns (
            bool active, address br, address remoteGST, address yieldOracle,
            uint256 maxDeploy, uint256 deployed, uint256 cumYield, string memory label
        )
    {
        (active, br, remoteGST, yieldOracle, maxDeploy, deployed, cumYield, label) =
            adapter.chains(chainId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FeeInvestmentManager tests
// ─────────────────────────────────────────────────────────────────────────────

contract FeeInvestmentManagerTest is Test {
    MockERC20            gst;
    MockERC20            usdc;
    L1AIFeePool          pool;
    GSTCrossChainAdapter xchain;
    FeeInvestmentManager manager;
    MockBridge           bridge;

    address governor   = address(0xC1);
    address keeper     = address(0xC2);
    address feeSource  = address(0xC3);
    address treasury   = address(0xC4);
    address oracle     = address(0xC5);

    uint256 constant ETH_MAINNET = 1;

    function setUp() public {
        gst    = new MockERC20("Ghost Token", "GST");
        usdc   = new MockERC20("USD Coin",    "USDC");
        bridge = new MockBridge();

        // Deploy pool (feeManager will be set after manager deployment)
        vm.startPrank(governor);
        pool = new L1AIFeePool(
            address(gst), address(usdc),
            governor, address(0),
            treasury,
            address(0) // will be updated after manager deployment
        );
        xchain = new GSTCrossChainAdapter(
            address(gst), governor, address(0), address(0) // fee manager TBD
        );
        manager = new FeeInvestmentManager(
            address(gst), address(usdc),
            governor, address(0),
            address(pool), address(xchain),
            feeSource, treasury
        );
        // Wire up fee manager
        pool.setFeeManager(address(manager));
        xchain.setFeeManager(address(manager));

        // Authorise keeper
        manager.setKeeper(keeper, true);

        // Register a chain on xchain
        xchain.addChain(ETH_MAINNET, address(bridge), address(0xCAFE), oracle, 10_000_000e18, "Ethereum");
        vm.stopPrank();

        // Seed fee source
        gst.mint(feeSource, 1_000_000e18);
        usdc.mint(feeSource, 1_000_000e18);
    }

    function test_harvest_splitsCorrectly() public {
        uint256 gstAmt  = 100_000e18;  // 60k → pool, 30k → xchain, 10k → reserve
        uint256 pairAmt = 10_000e18;   // 6k → pool, 4k → reserve

        // Add liquidity so pool can accept collectProtocolFees
        gst.mint(address(this), 200_000e18);
        usdc.mint(address(this), 200_000e18);
        gst.approve(address(pool), 200_000e18);
        usdc.approve(address(pool), 200_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);

        vm.startPrank(feeSource);
        gst.approve(address(manager), gstAmt);
        usdc.approve(address(manager), pairAmt);
        vm.stopPrank();

        vm.prank(keeper);
        manager.harvest(gstAmt, pairAmt);

        assertGt(manager.totalHarvested(), 0, "harvested recorded");
        assertGt(manager.totalToL1Pool(), 0, "something went to pool");
    }

    function test_harvest_revertCooldown() public {
        gst.mint(feeSource, 10e18);
        vm.startPrank(feeSource);
        gst.approve(address(manager), 10e18);
        vm.stopPrank();

        // Add liquidity first
        gst.mint(address(this), 200_000e18);
        usdc.mint(address(this), 200_000e18);
        gst.approve(address(pool), 200_000e18);
        usdc.approve(address(pool), 200_000e18);
        pool.addLiquidity(100_000e18, 100_000e18);

        vm.startPrank(feeSource);
        gst.approve(address(manager), 20e18);
        vm.stopPrank();

        vm.prank(keeper);
        manager.harvest(10e18, 0);

        vm.prank(keeper);
        vm.expectRevert();
        manager.harvest(10e18, 0); // should revert on cooldown
    }

    function test_harvest_revertNotKeeper() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        manager.harvest(1e18, 0);
    }

    function test_setAllocation_valid() public {
        vm.prank(governor);
        manager.setAllocation(5000, 3500, 1500);
        assertEq(manager.l1PoolBps(),     5000);
        assertEq(manager.crossChainBps(), 3500);
        assertEq(manager.reserveBps(),    1500);
    }

    function test_setAllocation_revertMismatch() public {
        vm.prank(governor);
        vm.expectRevert();
        manager.setAllocation(5000, 3000, 1001); // sum = 9001 ≠ 10000
    }

    function test_pause_blocksHarvest() public {
        vm.prank(governor);
        manager.setPaused(true);

        vm.prank(keeper);
        vm.expectRevert();
        manager.harvest(1e18, 0);
    }
}
