// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AIOracle — AI-generated data feeds: prices, risk scores, economic forecasts
contract AIOracle {

    struct Feed {
        bytes32  feedId;        // keccak256(name)
        string   name;          // e.g. "gdp.usa.forecast", "risk.gsxexchange"
        int256   value;         // scaled by 1e8
        uint256  confidence;    // 0-10000 bps
        uint256  updatedAt;
        bytes32  agentId;       // AI agent that produced the value
        bytes32  proofHash;     // hash of off-chain computation proof
    }

    mapping(bytes32  => Feed)    public feeds;
    mapping(bytes32  => bool)    public authorisedFeeders; // agentId -> allowed
    bytes32[] public feedIndex;

    address public governance;

    event FeedCreated(bytes32 indexed feedId, string name);
    event FeedUpdated(bytes32 indexed feedId, int256 value, uint256 confidence, bytes32 agentId);
    event FeederAuthorised(bytes32 indexed agentId, bool status);

    modifier onlyGovernance() {
        require(msg.sender == governance, "AIOracle: not governance");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
    }

    function authoriseFeeder(bytes32 agentId, bool status) external onlyGovernance {
        authorisedFeeders[agentId] = status;
        emit FeederAuthorised(agentId, status);
    }

    function createFeed(string calldata name) external onlyGovernance returns (bytes32 feedId) {
        feedId = keccak256(abi.encodePacked(name));
        require(feeds[feedId].updatedAt == 0, "AIOracle: feed exists");
        feeds[feedId].feedId = feedId;
        feeds[feedId].name   = name;
        feedIndex.push(feedId);
        emit FeedCreated(feedId, name);
    }

    function updateFeed(
        bytes32 feedId,
        int256  value,
        uint256 confidence,
        bytes32 agentId,
        bytes32 proofHash
    ) external {
        require(authorisedFeeders[agentId], "AIOracle: feeder not authorised");
        require(confidence <= 10000, "AIOracle: confidence > 100%");
        Feed storage f = feeds[feedId];
        require(f.feedId != bytes32(0), "AIOracle: feed not found");
        f.value      = value;
        f.confidence = confidence;
        f.updatedAt  = block.timestamp;
        f.agentId    = agentId;
        f.proofHash  = proofHash;
        emit FeedUpdated(feedId, value, confidence, agentId);
    }

    function getLatest(bytes32 feedId) external view returns (int256 value, uint256 confidence, uint256 updatedAt) {
        Feed storage f = feeds[feedId];
        return (f.value, f.confidence, f.updatedAt);
    }

    function getFeedCount() external view returns (uint256) {
        return feedIndex.length;
    }
}
