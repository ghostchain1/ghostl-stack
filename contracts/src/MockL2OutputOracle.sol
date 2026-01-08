// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockL2OutputOracle {
    struct OutputProposal {
        bytes32 outputRoot;
        uint256 timestamp;
        uint256 l2BlockNumber;
    }

    OutputProposal[] private outputs;

    event OutputProposed(
        bytes32 indexed outputRoot,
        uint256 indexed l2BlockNumber,
        uint256 timestamp
    );

    constructor(uint256 startingBlockNumber) {
        // Seed with a genesis output so reader methods have data to return.
        outputs.push(
            OutputProposal({
                outputRoot: bytes32(0),
                timestamp: block.timestamp,
                l2BlockNumber: startingBlockNumber
            })
        );
    }

    function version() external pure returns (string memory) {
        return "1.0.0-mock";
    }

    function latestOutputIndex() external view returns (uint256) {
        return outputs.length - 1;
    }

    function nextBlockNumber() external view returns (uint256) {
        return outputs[outputs.length - 1].l2BlockNumber + 1;
    }

    function getL2Output(uint256 index) external view returns (OutputProposal memory) {
        require(index < outputs.length, "index out of range");
        return outputs[index];
    }

    function proposeL2Output(
        bytes32 outputRoot,
        uint256 l2BlockNumber,
        bytes32 /*l1BlockHash*/,
        uint256 /*l1BlockNumber*/
    ) external {
        outputs.push(
            OutputProposal({
                outputRoot: outputRoot,
                timestamp: block.timestamp,
                l2BlockNumber: l2BlockNumber
            })
        );
        emit OutputProposed(outputRoot, l2BlockNumber, block.timestamp);
    }
}
