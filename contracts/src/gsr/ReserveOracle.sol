// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveOracle
/// @notice Provides verified real-world commodity and reserve price data on-chain.
///         Data sources: government reports, commodity markets, satellite monitoring, IoT sensors.
contract ReserveOracle {

    struct PriceFeed {
        bytes32 assetId;     // e.g. keccak256("GOLD")
        string  assetName;
        uint256 price;       // USD price per unit (18 decimal precision)
        uint256 updatedAt;
        address reporter;
        bool    active;
    }

    struct ReserveValuation {
        bytes32 reserveId;
        uint256 quantity;
        uint256 unitPrice;
        uint256 totalValue;  // quantity * unitPrice / 1e18
        uint256 timestamp;
    }

    mapping(bytes32 => PriceFeed)       public feeds;
    mapping(bytes32 => ReserveValuation) public valuations;
    mapping(address => bool)            public reporters;
    bytes32[]                           public feedIds;
    address public admin;

    event PriceUpdated(bytes32 indexed assetId, uint256 price, address reporter, uint256 timestamp);
    event ReserveValued(bytes32 indexed reserveId, uint256 totalValue, uint256 timestamp);
    event ReporterAdded(address indexed reporter);

    modifier onlyAdmin()    { require(msg.sender == admin, "Oracle: not admin"); _; }
    modifier onlyReporter() { require(reporters[msg.sender] || msg.sender == admin, "Oracle: not reporter"); _; }

    constructor() {
        admin = msg.sender;
        reporters[msg.sender] = true;
    }

    function addReporter(address r) external onlyAdmin {
        reporters[r] = true;
        emit ReporterAdded(r);
    }

    function registerFeed(bytes32 assetId, string memory assetName) external onlyAdmin {
        feeds[assetId] = PriceFeed({
            assetId:   assetId,
            assetName: assetName,
            price:     0,
            updatedAt: 0,
            reporter:  msg.sender,
            active:    true
        });
        feedIds.push(assetId);
    }

    function updatePrice(bytes32 assetId, uint256 price) external onlyReporter {
        PriceFeed storage f = feeds[assetId];
        require(f.active, "Oracle: feed inactive");
        f.price     = price;
        f.updatedAt = block.timestamp;
        f.reporter  = msg.sender;
        emit PriceUpdated(assetId, price, msg.sender, block.timestamp);
    }

    function recordValuation(bytes32 reserveId, bytes32 assetId, uint256 quantity) external onlyReporter {
        uint256 unitPrice  = feeds[assetId].price;
        uint256 totalValue = (quantity * unitPrice) / 1e18;
        valuations[reserveId] = ReserveValuation({
            reserveId: reserveId,
            quantity:  quantity,
            unitPrice: unitPrice,
            totalValue: totalValue,
            timestamp: block.timestamp
        });
        emit ReserveValued(reserveId, totalValue, block.timestamp);
    }

    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 updatedAt) {
        PriceFeed storage f = feeds[assetId];
        return (f.price, f.updatedAt);
    }

    function feedCount() external view returns (uint256) { return feedIds.length; }
}
