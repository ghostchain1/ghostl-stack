// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ReentrancyGuard.sol";
import "./IGhostXOrderBook.sol";
import "./GhostXVault.sol";
import "./GhostXFeeCollector.sol";
import "./GhostXBadge.sol";

/// @title  GhostXOrderBook
/// @notice On-chain limit order book for the Ghost X exchange on GhostChain L2.
///
/// Design:
///  - Traders deposit tokens into GhostXVault.
///  - Limit orders lock the required funds in the vault.
///  - An authorised *matcher* role (the off-chain matching engine) calls
///    `matchOrders` to atomically settle a crossing pair.
///  - Maker and taker fees (in quote / base token) are forwarded to
///    GhostXFeeCollector.
///  - Market-order semantics: place a limit order with `price = 0` (buy)
///    or `price = type(uint256).max` (sell) to signal IOC market intent;
///    the matcher will fill it at whatever prices exist.
///
/// Pair listing:
///  - Only the owner (governance) can list new trading pairs.
///
contract GhostXOrderBook is IGhostXOrderBook, ReentrancyGuard {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    GhostXVault        public immutable vault;
    GhostXFeeCollector public immutable feeCollector;
    GhostXBadge        public badge;  // optional — zero address disables discounts

    /// @notice Accounts authorised to call matchOrders.
    mapping(address => bool) public matchers;

    /// orderIdCounter starts at 1 so that 0 is an "unset" sentinel.
    uint256 public orderIdCounter;
    uint256 public fillIdCounter;

    /// @dev Flat storage of orders by id.
    mapping(uint256 => Order) private _orders;

    /// @dev trader => set of open order ids.
    mapping(address => uint256[]) private _traderOrders;

    /// @dev pair key => sorted price buckets (price => total open base amount).
    ///      Used for best-bid / best-ask queries only; matching is off-chain.
    mapping(bytes32 => mapping(uint256 => uint256)) private _pairBidDepth;
    mapping(bytes32 => mapping(uint256 => uint256)) private _pairAskDepth;

    /// @dev Tracked best prices (approximate – recomputed by matcher).
    mapping(bytes32 => uint256) public bestBidPrice;
    mapping(bytes32 => uint256) public bestAskPrice;

    /// @dev Listed pairs.
    mapping(bytes32 => bool) public pairListed;

    /// Fee in basis points (1 bp = 0.01 %).
    uint256 public makerFeeBps = 5;  // 0.05 %
    uint256 public takerFeeBps = 10; // 0.10 %

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotMatcher();
    error PairNotListed(address base, address quote);
    error PairAlreadyListed(address base, address quote);
    error SameToken();
    error ZeroAmount();
    error ZeroPrice();
    error NotTrader(uint256 orderId);
    error OrderNotOpen(uint256 orderId);
    error PriceMismatch(uint256 buyPrice, uint256 sellPrice);
    error SameSide();
    error InvalidPair();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address vault_, address feeCollector_) {
        require(vault_ != address(0) && feeCollector_ != address(0), "zero addr");
        vault        = GhostXVault(payable(vault_));
        feeCollector = GhostXFeeCollector(feeCollector_);
        owner        = msg.sender;
        matchers[msg.sender] = true;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMatcher() {
        if (!matchers[msg.sender]) revert NotMatcher();
        _;
    }

    // ─── Pair management (owner) ──────────────────────────────────────────────

    function listPair(address baseToken, address quoteToken) external onlyOwner {
        if (baseToken == quoteToken) revert SameToken();
        if (baseToken == address(0) || quoteToken == address(0)) revert InvalidPair();
        bytes32 key = _pairKey(baseToken, quoteToken);
        if (pairListed[key]) revert PairAlreadyListed(baseToken, quoteToken);
        pairListed[key] = true;
        emit MarketPairListed(baseToken, quoteToken);
    }

    function setMatcher(address matcher, bool enabled) external onlyOwner {
        matchers[matcher] = enabled;
    }

    function setFees(uint256 makerBps, uint256 takerBps) external onlyOwner {
        require(makerBps <= 100 && takerBps <= 100, "fee>1%");
        makerFeeBps = makerBps;
        takerFeeBps = takerBps;
    }

    function setBadgeContract(address badge_) external onlyOwner {
        // Can be set to address(0) to disable discounts
        badge = GhostXBadge(badge_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "not pending owner");
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ─── Order placement ─────────────────────────────────────────────────────

    /// @inheritdoc IGhostXOrderBook
    function placeLimitOrder(
        address baseToken,
        address quoteToken,
        Side side,
        uint256 price,
        uint256 baseAmount
    ) external override nonReentrant returns (uint256 orderId) {
        if (baseAmount == 0) revert ZeroAmount();
        if (price == 0) revert ZeroPrice();
        bytes32 key = _pairKey(baseToken, quoteToken);
        if (!pairListed[key]) revert PairNotListed(baseToken, quoteToken);

        // Determine which token must be locked.
        (address lockToken, uint256 lockAmount) = _requiredLock(side, baseToken, quoteToken, price, baseAmount);
        vault.lock(msg.sender, lockToken, lockAmount);

        orderId = ++orderIdCounter;
        _orders[orderId] = Order({
            orderId:    orderId,
            trader:     msg.sender,
            baseToken:  baseToken,
            quoteToken: quoteToken,
            side:       side,
            price:      price,
            baseAmount: baseAmount,
            filled:     0,
            timestamp:  block.timestamp,
            status:     OrderStatus.OPEN
        });

        _traderOrders[msg.sender].push(orderId);

        // Update depth.
        if (side == Side.BUY) {
            _pairBidDepth[key][price] += baseAmount;
            if (price > bestBidPrice[key]) bestBidPrice[key] = price;
        } else {
            _pairAskDepth[key][price] += baseAmount;
            if (bestAskPrice[key] == 0 || price < bestAskPrice[key]) bestAskPrice[key] = price;
        }

        emit OrderPlaced(orderId, msg.sender, baseToken, quoteToken, side, price, baseAmount);
    }

    // ─── Order cancellation ───────────────────────────────────────────────────

    /// @inheritdoc IGhostXOrderBook
    function cancelOrder(uint256 orderId) external override nonReentrant {
        Order storage o = _orders[orderId];
        if (o.trader != msg.sender) revert NotTrader(orderId);
        if (o.status != OrderStatus.OPEN && o.status != OrderStatus.PARTIAL) revert OrderNotOpen(orderId);

        o.status = OrderStatus.CANCELLED;

        uint256 remaining = o.baseAmount - o.filled;
        bytes32 key = _pairKey(o.baseToken, o.quoteToken);

        (address lockToken, uint256 lockAmount) = _requiredLock(o.side, o.baseToken, o.quoteToken, o.price, remaining);
        vault.unlock(o.trader, lockToken, lockAmount);

        // Update depth.
        if (o.side == Side.BUY) {
            if (_pairBidDepth[key][o.price] >= remaining) _pairBidDepth[key][o.price] -= remaining;
        } else {
            if (_pairAskDepth[key][o.price] >= remaining) _pairAskDepth[key][o.price] -= remaining;
        }

        emit OrderCancelled(orderId, msg.sender);
    }

    // ─── Matching (matcher role) ───────────────────────────────────────────────

    /// @inheritdoc IGhostXOrderBook
    /// @dev The matcher must verify off-chain that buy.price >= sell.price.
    ///      Fill is at the maker (resting) price.
    function matchOrders(
        uint256 buyOrderId,
        uint256 sellOrderId
    ) external override onlyMatcher nonReentrant returns (uint256 fillId) {
        Order storage buy  = _orders[buyOrderId];
        Order storage sell = _orders[sellOrderId];

        if (buy.side  != Side.BUY)  revert SameSide();
        if (sell.side != Side.SELL) revert SameSide();
        if (buy.baseToken  != sell.baseToken)  revert InvalidPair();
        if (buy.quoteToken != sell.quoteToken) revert InvalidPair();
        if (buy.price < sell.price) revert PriceMismatch(buy.price, sell.price);
        if (buy.status  != OrderStatus.OPEN && buy.status  != OrderStatus.PARTIAL) revert OrderNotOpen(buyOrderId);
        if (sell.status != OrderStatus.OPEN && sell.status != OrderStatus.PARTIAL) revert OrderNotOpen(sellOrderId);

        // Fill at the maker (resting) price – we treat the older order as maker.
        uint256 fillPrice = buy.timestamp <= sell.timestamp ? buy.price : sell.price;

        uint256 buyRemaining  = buy.baseAmount  - buy.filled;
        uint256 sellRemaining = sell.baseAmount - sell.filled;
        uint256 fillBase      = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
        uint256 fillQuote     = (fillBase * fillPrice) / 1e18;

        // ── Settle base: sell → buy ──
        uint256 takerBaseFee  = (fillBase  * takerFeeBps) / 10_000;
        uint256 makerBaseFee  = (fillBase  * makerFeeBps) / 10_000;
        (bool buyIsMaker)     = buy.timestamp <= sell.timestamp;

        // Determine maker/taker fees per side.
        uint256 sellBaseFee  = buyIsMaker ? makerBaseFee : takerBaseFee;
        uint256 buyQuoteFee  = buyIsMaker ? takerBaseFee : makerBaseFee; // approximate in quote

        // Apply badge fee discounts (reduce fee by discount %).
        if (address(badge) != address(0)) {
            uint256 buyDiscount  = badge.discountBps(buy.trader);
            uint256 sellDiscount = badge.discountBps(sell.trader);
            if (buyDiscount  > 0) buyQuoteFee  = buyQuoteFee  - (buyQuoteFee  * buyDiscount)  / 10_000;
            if (sellDiscount > 0) sellBaseFee  = sellBaseFee  - (sellBaseFee  * sellDiscount) / 10_000;
        }

        // Settle base from sell to buy.
        vault.settle(sell.trader, buy.trader,  sell.baseToken,  fillBase - sellBaseFee);
        // Settle quote from buy to sell.
        vault.settle(buy.trader,  sell.trader, buy.quoteToken,  fillQuote - (fillQuote * buyQuoteFee / fillBase));

        // Collect fees (unlock from both traders and transfer to feeCollector).
        if (sellBaseFee > 0) {
            vault.unlock(sell.trader, sell.baseToken, sellBaseFee);
            // feeCollector receives by direct transfer from vault — handled via GhostXFeeCollector.recordFee.
            feeCollector.recordFee(sell.baseToken, sellBaseFee, sell.trader);
        }

        // Update filled amounts and statuses.
        buy.filled  += fillBase;
        sell.filled += fillBase;

        bytes32 key = _pairKey(buy.baseToken, buy.quoteToken);
        _pairBidDepth[key][buy.price]  = _pairBidDepth[key][buy.price]  > fillBase ? _pairBidDepth[key][buy.price]  - fillBase : 0;
        _pairAskDepth[key][sell.price] = _pairAskDepth[key][sell.price] > fillBase ? _pairAskDepth[key][sell.price] - fillBase : 0;

        buy.status  = buy.filled  >= buy.baseAmount  ? OrderStatus.FILLED : OrderStatus.PARTIAL;
        sell.status = sell.filled >= sell.baseAmount ? OrderStatus.FILLED : OrderStatus.PARTIAL;

        fillId = ++fillIdCounter;
        emit OrderFilled(fillId, buyOrderId, sellOrderId, fillBase, fillPrice);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /// @inheritdoc IGhostXOrderBook
    function getOrder(uint256 orderId) external view override returns (Order memory) {
        return _orders[orderId];
    }

    /// @inheritdoc IGhostXOrderBook
    function getOpenOrders(address trader) external view override returns (uint256[] memory orderIds) {
        uint256[] storage all = _traderOrders[trader];
        uint256 count;
        for (uint256 i; i < all.length; ++i) {
            OrderStatus s = _orders[all[i]].status;
            if (s == OrderStatus.OPEN || s == OrderStatus.PARTIAL) ++count;
        }
        orderIds = new uint256[](count);
        uint256 j;
        for (uint256 i; i < all.length; ++i) {
            OrderStatus s = _orders[all[i]].status;
            if (s == OrderStatus.OPEN || s == OrderStatus.PARTIAL) orderIds[j++] = all[i];
        }
    }

    /// @inheritdoc IGhostXOrderBook
    function bestBid(address baseToken, address quoteToken) external view override returns (uint256 price, uint256 depth) {
        bytes32 key = _pairKey(baseToken, quoteToken);
        price = bestBidPrice[key];
        depth = _pairBidDepth[key][price];
    }

    /// @inheritdoc IGhostXOrderBook
    function bestAsk(address baseToken, address quoteToken) external view override returns (uint256 price, uint256 depth) {
        bytes32 key = _pairKey(baseToken, quoteToken);
        price = bestAskPrice[key];
        depth = _pairAskDepth[key][price];
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _pairKey(address base, address quote) internal pure returns (bytes32 key) {
        assembly {
            mstore(0x00, shl(96, base))
            mstore(0x14, shl(96, quote))
            key := keccak256(0x00, 0x28)
        }
    }

    /// @dev Returns the token and amount that must be locked when placing an order.
    ///      BUY  orders lock quote tokens: lockAmount = baseAmount * price / 1e18
    ///      SELL orders lock base tokens:  lockAmount = baseAmount
    function _requiredLock(
        Side side,
        address baseToken,
        address quoteToken,
        uint256 price,
        uint256 baseAmount
    ) internal pure returns (address lockToken, uint256 lockAmount) {
        if (side == Side.BUY) {
            lockToken  = quoteToken;
            lockAmount = (baseAmount * price) / 1e18;
        } else {
            lockToken  = baseToken;
            lockAmount = baseAmount;
        }
    }
}
