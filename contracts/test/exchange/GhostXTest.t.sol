// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/exchange/GhostXFeeCollector.sol";
import "../../src/exchange/GhostXVault.sol";
import "../../src/exchange/GhostXOrderBook.sol";
import "../../src/exchange/IGhostXOrderBook.sol";

/// @dev Minimal ERC-20 stub for testing.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_) { name = name_; symbol = symbol_; }

    function mint(address to, uint256 amount) external {
        totalSupply        += amount;
        balanceOf[to]      += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        return true;
    }
}

contract GhostXTest is Test {
    // ─── Actors ────────────────────────────────────────────────────────────────
    address constant TREASURY = address(0xBEEF);
    address constant ALICE    = address(0xA11CE);
    address constant BOB      = address(0xB0B);
    address constant MATCHER  = address(0xDEAD);

    // ─── Contracts ─────────────────────────────────────────────────────────────
    MockERC20        base;
    MockERC20        quote;
    GhostXFeeCollector fc;
    GhostXVault      vault;
    GhostXOrderBook  book;

    uint256 constant BASE_AMOUNT  = 1e18;   // 1 token
    uint256 constant PRICE        = 100e18; // 100 quote per base

    // ─── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        base  = new MockERC20("GhostBase",  "GB");
        quote = new MockERC20("GhostQuote", "GQ");

        fc    = new GhostXFeeCollector(TREASURY);

        // Predict vault address for book constructor (on-chain: deployer=this, nonce auto).
        // For tests we deploy via create and pass nonce=2 (fc=0, vault=1, book=2 relative).
        // Simpler: deploy vault with a placeholder then upgrade.
        // Here we use a two-step trick accepted by the test harness.

        // Deploy with a dummy book address, then upgrade via inheritance override in tests.
        // In production, DeployGhostX.s.sol handles proper prediction.
        vm.prank(address(this));
        uint64 nonce = vm.getNonce(address(this));
        address predictedBook = _computeCreate(address(this), nonce + 1);

        vault = new GhostXVault(predictedBook);
        book  = new GhostXOrderBook(address(vault), address(fc));

        require(address(book) == predictedBook, "nonce mismatch in test setup");

        fc.setOrderBook(address(book));
        book.setMatcher(MATCHER, true);
        book.setFees(0, 0); // zero fees for simpler assertions

        // Whitelist pair.
        book.listPair(address(base), address(quote));

        // Fund traders.
        base.mint(BOB,    10 * BASE_AMOUNT);
        quote.mint(ALICE, 10 * PRICE);

        // Deposit to vault.
        vm.startPrank(BOB);
        base.approve(address(vault), type(uint256).max);
        vault.deposit(address(base), 5 * BASE_AMOUNT);
        vm.stopPrank();

        vm.startPrank(ALICE);
        quote.approve(address(vault), type(uint256).max);
        vault.deposit(address(quote), 5 * PRICE);
        vm.stopPrank();
    }

    // ─── Tests ─────────────────────────────────────────────────────────────────

    function test_placeLimitBuy() public {
        vm.prank(ALICE);
        uint256 orderId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.BUY,
            PRICE, BASE_AMOUNT
        );
        IGhostXOrderBook.Order memory o = book.getOrder(orderId);
        assertEq(o.trader,     ALICE);
        assertEq(o.baseAmount, BASE_AMOUNT);
        assertEq(uint8(o.side), uint8(IGhostXOrderBook.Side.BUY));
        assertEq(uint8(o.status), uint8(IGhostXOrderBook.OrderStatus.OPEN));
    }

    function test_placeLimitSell() public {
        vm.prank(BOB);
        uint256 orderId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.SELL,
            PRICE, BASE_AMOUNT
        );
        IGhostXOrderBook.Order memory o = book.getOrder(orderId);
        assertEq(o.trader,     BOB);
        assertEq(uint8(o.side), uint8(IGhostXOrderBook.Side.SELL));
    }

    function test_matchOrders_settles() public {
        // Alice places BUY.
        vm.prank(ALICE);
        uint256 buyId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.BUY,
            PRICE, BASE_AMOUNT
        );

        // Bob places SELL at same price.
        vm.prank(BOB);
        uint256 sellId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.SELL,
            PRICE, BASE_AMOUNT
        );

        uint256 aliceBaseBefore = vault.balance(ALICE, address(base));
        uint256 bobQuoteBefore  = vault.balance(BOB,   address(quote));

        // Matcher crosses the orders.
        vm.prank(MATCHER);
        book.matchOrders(buyId, sellId);

        // Alice should have received base tokens.
        assertGe(vault.balance(ALICE, address(base)), aliceBaseBefore + BASE_AMOUNT - 100);
        // Bob should have received quote tokens.
        assertGe(vault.balance(BOB,   address(quote)), bobQuoteBefore + PRICE - 100);

        // Both orders should be FILLED.
        assertEq(uint8(book.getOrder(buyId).status),  uint8(IGhostXOrderBook.OrderStatus.FILLED));
        assertEq(uint8(book.getOrder(sellId).status), uint8(IGhostXOrderBook.OrderStatus.FILLED));
    }

    function test_cancelOrder_unlocksFunds() public {
        vm.prank(ALICE);
        uint256 buyId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.BUY,
            PRICE, BASE_AMOUNT
        );

        uint256 lockedBefore = vault.locked(ALICE, address(quote));
        assertGt(lockedBefore, 0);

        vm.prank(ALICE);
        book.cancelOrder(buyId);

        assertEq(vault.locked(ALICE, address(quote)), 0);
        assertEq(uint8(book.getOrder(buyId).status), uint8(IGhostXOrderBook.OrderStatus.CANCELLED));
    }

    function test_revert_nonMatcher_cannotMatch() public {
        vm.prank(ALICE);
        uint256 buyId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.BUY,
            PRICE, BASE_AMOUNT
        );
        vm.prank(BOB);
        uint256 sellId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.SELL,
            PRICE, BASE_AMOUNT
        );

        vm.prank(address(0xBAD));
        vm.expectRevert(GhostXOrderBook.NotMatcher.selector);
        book.matchOrders(buyId, sellId);
    }

    function test_revert_priceCross_notAllowed() public {
        vm.prank(ALICE);
        uint256 buyId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.BUY,
            PRICE, BASE_AMOUNT
        );
        // Sell at HIGHER price than buy.
        vm.prank(BOB);
        uint256 sellId = book.placeLimitOrder(
            address(base), address(quote),
            IGhostXOrderBook.Side.SELL,
            PRICE * 2, BASE_AMOUNT
        );

        vm.prank(MATCHER);
        vm.expectRevert(abi.encodeWithSelector(GhostXOrderBook.PriceMismatch.selector, PRICE, PRICE * 2));
        book.matchOrders(buyId, sellId);
    }

    function test_bestBidAsk() public {
        vm.prank(ALICE);
        book.placeLimitOrder(address(base), address(quote), IGhostXOrderBook.Side.BUY,  PRICE,     BASE_AMOUNT);
        vm.prank(BOB);
        book.placeLimitOrder(address(base), address(quote), IGhostXOrderBook.Side.SELL, PRICE * 2, BASE_AMOUNT);

        (uint256 bid,)  = book.bestBid(address(base), address(quote));
        (uint256 ask,)  = book.bestAsk(address(base), address(quote));

        assertEq(bid, PRICE);
        assertEq(ask, PRICE * 2);
    }

    // ─── Helper ────────────────────────────────────────────────────────────────

    function _computeCreate(address deployer_, uint64 nonce_) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xd6), bytes1(0x94), deployer_, bytes1(uint8(nonce_))
        )))));
    }
}
