// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @dev Dummy L2OO used for quick wiring/testing. Ported from infra/opstack/contracts/DummyL2OO.sol.
contract DummyL2OO {
    uint256 public latestOutputIndex;
    uint256 public nextBlockNumber;
    uint256 public immutable submissionInterval = 1;
    uint256 public immutable l2BlockTime = 2;
    uint256 public immutable startingTimestamp = 1;
    uint256 public immutable startingBlockNumber = 0;
    uint256 public immutable finalizationPeriodSeconds = 12;
    address public immutable proposer = address(1);
    address public immutable challenger = address(1);

    constructor() {
        latestOutputIndex = 0;
        nextBlockNumber = startingBlockNumber;
    }

    function version() external pure returns (string memory) {
        return "dummy-0.8.17";
    }

    function nextOutputIndex() external view returns (uint256) {
        return latestOutputIndex + 1;
    }

    function latestBlockNumber() external view returns (uint256) {
        return nextBlockNumber;
    }

    function initialize(
        uint256,
        uint256,
        uint256,
        uint256,
        address,
        address,
        uint256
    ) external {}

    function proposeL2Output(bytes32, uint256 l2BlockNumber, bytes32, uint256) external {
        nextBlockNumber = l2BlockNumber + submissionInterval;
        latestOutputIndex += 1;
    }
}
