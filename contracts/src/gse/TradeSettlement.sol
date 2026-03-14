// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TradeSettlement — sovereign bilateral trade recording & settlement
contract TradeSettlement {

    enum TradeStatus { Pending, Settled, Disputed, Cancelled }

    struct Trade {
        address  exporter;
        address  importer;
        bytes32  commodity;    // keccak256 of commodity name e.g. "OIL"
        uint256  quantity;     // in smallest unit
        uint256  valueUSD;     // in cents (6 decimals)
        uint256  tariffBps;
        TradeStatus status;
        uint256  timestamp;
    }

    uint256 public nextTradeId;
    mapping(uint256 => Trade) public trades;

    address public gsn;   // GSN settlement contract integration
    address public governance;

    event TradeRecorded(uint256 indexed id, address exporter, address importer, bytes32 commodity);
    event TradeSettled(uint256 indexed id, uint256 valueUSD);
    event TradeDisputed(uint256 indexed id);

    modifier onlyGovernance() {
        require(msg.sender == governance, "TradeSettlement: not governance");
        _;
    }

    constructor(address _gov, address _gsn) {
        governance = _gov;
        gsn = _gsn;
    }

    function recordTrade(
        address  importer,
        bytes32  commodity,
        uint256  quantity,
        uint256  valueUSD,
        uint256  tariffBps
    ) external returns (uint256 id) {
        id = nextTradeId++;
        trades[id] = Trade({
            exporter:  msg.sender,
            importer:  importer,
            commodity: commodity,
            quantity:  quantity,
            valueUSD:  valueUSD,
            tariffBps: tariffBps,
            status:    TradeStatus.Pending,
            timestamp: block.timestamp
        });
        emit TradeRecorded(id, msg.sender, importer, commodity);
    }

    function settleTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.status == TradeStatus.Pending, "TradeSettlement: not pending");
        require(msg.sender == t.importer || msg.sender == governance,
            "TradeSettlement: not authorised");
        t.status = TradeStatus.Settled;
        emit TradeSettled(tradeId, t.valueUSD);
    }

    function disputeTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.status == TradeStatus.Pending, "TradeSettlement: not pending");
        require(msg.sender == t.exporter || msg.sender == t.importer,
            "TradeSettlement: not party");
        t.status = TradeStatus.Disputed;
        emit TradeDisputed(tradeId);
    }

    function resolveDispute(uint256 tradeId, TradeStatus resolution) external onlyGovernance {
        require(trades[tradeId].status == TradeStatus.Disputed, "TradeSettlement: not disputed");
        require(resolution == TradeStatus.Settled || resolution == TradeStatus.Cancelled,
            "TradeSettlement: invalid resolution");
        trades[tradeId].status = resolution;
    }
}
