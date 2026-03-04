// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGhostXOrderBook
/// @notice Interface for the Ghost X on-chain order book on GhostChain L2.
interface IGhostXOrderBook {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum Side { BUY, SELL }
    enum OrderStatus { OPEN, FILLED, PARTIAL, CANCELLED }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Order {
        uint256 orderId;
        address trader;
        address baseToken;
        address quoteToken;
        Side    side;
        uint256 price;      // quote per base, 18-decimal fixed-point
        uint256 baseAmount; // total base quantity
        uint256 filled;     // base quantity already matched
        uint256 timestamp;
        OrderStatus status;
    }

    struct Fill {
        uint256 fillId;
        uint256 buyOrderId;
        uint256 sellOrderId;
        uint256 baseAmount;
        uint256 price;
        uint256 timestamp;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed trader,
        address baseToken,
        address quoteToken,
        Side side,
        uint256 price,
        uint256 baseAmount
    );

    event OrderFilled(
        uint256 indexed fillId,
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        uint256 baseAmount,
        uint256 price
    );

    event OrderCancelled(uint256 indexed orderId, address indexed trader);

    event MarketPairListed(address indexed baseToken, address indexed quoteToken);

    // ─── Functions ───────────────────────────────────────────────────────────

    function placeLimitOrder(
        address baseToken,
        address quoteToken,
        Side side,
        uint256 price,
        uint256 baseAmount
    ) external returns (uint256 orderId);

    function cancelOrder(uint256 orderId) external;

    function matchOrders(uint256 buyOrderId, uint256 sellOrderId) external returns (uint256 fillId);

    function getOrder(uint256 orderId) external view returns (Order memory);

    function getOpenOrders(address trader) external view returns (uint256[] memory orderIds);

    function bestBid(address baseToken, address quoteToken) external view returns (uint256 price, uint256 depth);

    function bestAsk(address baseToken, address quoteToken) external view returns (uint256 price, uint256 depth);
}
