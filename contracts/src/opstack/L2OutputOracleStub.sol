// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal L2 Output Oracle stub for local/devnet use only.
///      Ported from infra/opstack/contracts/L2OOStub.sol so Hardhat builds use a single source of truth.
contract L2OutputOracle {
    // Immutable config
    uint256 public immutable SUBMISSION_INTERVAL;
    uint256 public immutable L2_BLOCK_TIME;
    uint256 public immutable STARTING_BLOCK_NUMBER;
    uint256 public immutable STARTING_TIMESTAMP;
    address public immutable PROPOSER;
    address public immutable CHALLENGER;
    uint256 public immutable FINALIZATION_PERIOD_SECONDS;

    // Mutable state
    uint256 public nextOutputIndex;
    uint256 public latestBlockNumber;

    event OutputProposed(
        bytes32 outputRoot,
        uint256 l2OutputIndex,
        uint256 l2BlockNumber,
        bytes32 l1BlockHash,
        uint256 l1BlockNumber,
        address proposer
    );

    constructor(
        uint256 _submissionInterval,
        uint256 _l2BlockTime,
        uint256 _startingBlockNumber,
        uint256 _startingTimestamp,
        address _proposer,
        address _challenger,
        uint256 _finalizationPeriodSeconds
    ) {
        SUBMISSION_INTERVAL = _submissionInterval;
        L2_BLOCK_TIME = _l2BlockTime;
        STARTING_BLOCK_NUMBER = _startingBlockNumber;
        STARTING_TIMESTAMP = _startingTimestamp;
        PROPOSER = _proposer;
        CHALLENGER = _challenger;
        FINALIZATION_PERIOD_SECONDS = _finalizationPeriodSeconds;
        nextOutputIndex = 0;
        latestBlockNumber = _startingBlockNumber;
    }

    function version() external pure returns (string memory) {
        return "dev-stub";
    }

    function submissionInterval() external view returns (uint256) {
        return SUBMISSION_INTERVAL;
    }

    function l2BlockTime() external view returns (uint256) {
        return L2_BLOCK_TIME;
    }

    function startingBlockNumber() external view returns (uint256) {
        return STARTING_BLOCK_NUMBER;
    }

    function startingTimestamp() external view returns (uint256) {
        return STARTING_TIMESTAMP;
    }

    function finalizationPeriodSeconds() external view returns (uint256) {
        return FINALIZATION_PERIOD_SECONDS;
    }

    function proposer() external view returns (address) {
        return PROPOSER;
    }

    function challenger() external view returns (address) {
        return CHALLENGER;
    }

    function nextBlockNumber() external view returns (uint256) {
        return STARTING_BLOCK_NUMBER + (nextOutputIndex * SUBMISSION_INTERVAL);
    }

    function computeL2Timestamp(uint256 _l2BlockNumber) external view returns (uint256) {
        return STARTING_TIMESTAMP + (_l2BlockNumber - STARTING_BLOCK_NUMBER) * L2_BLOCK_TIME;
    }

    function proposeL2Output(
        bytes32 outputRoot,
        uint256 l2BlockNumber,
        bytes32 l1BlockHash,
        uint256 l1BlockNumber
    ) external {
        require(msg.sender == PROPOSER, "not proposer");
        uint256 index = nextOutputIndex;
        nextOutputIndex = index + 1;
        latestBlockNumber = l2BlockNumber;
        emit OutputProposed(outputRoot, index, l2BlockNumber, l1BlockHash, l1BlockNumber, msg.sender);
    }
}
