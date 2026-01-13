// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Minimal L2 Output Oracle for devnet/proposer usage. Stores output roots and associated L2 block numbers.
contract L2OutputOracle is Ownable {
    struct OutputProposal {
        bytes32 outputRoot;
        uint256 l2BlockNumber;
        uint256 timestamp;
    }

    address public proposer;
    uint256 public latestBlockNumber;
    OutputProposal[] public outputs;

    event ProposerUpdated(address indexed newProposer);
    event OutputProposed(bytes32 indexed outputRoot, uint256 indexed l2BlockNumber, uint256 timestamp);

    error NotProposer();
    error NonMonotonicBlockNumber();

    constructor(address _proposer) {
        proposer = _proposer == address(0) ? msg.sender : _proposer;
        emit ProposerUpdated(proposer);
    }

    function setProposer(address _proposer) external onlyOwner {
        require(_proposer != address(0), "proposer=0");
        proposer = _proposer;
        emit ProposerUpdated(_proposer);
    }

    function proposeOutput(bytes32 outputRoot, uint256 l2BlockNumber) external {
        if (msg.sender != proposer) revert NotProposer();
        if (l2BlockNumber <= latestBlockNumber) revert NonMonotonicBlockNumber();

        OutputProposal memory proposal = OutputProposal({
            outputRoot: outputRoot,
            l2BlockNumber: l2BlockNumber,
            timestamp: block.timestamp
        });

        outputs.push(proposal);
        latestBlockNumber = l2BlockNumber;
        emit OutputProposed(outputRoot, l2BlockNumber, block.timestamp);
    }

    function getOutput(uint256 index) external view returns (OutputProposal memory) {
        require(index < outputs.length, "index oob");
        return outputs[index];
    }

    function outputsLength() external view returns (uint256) {
        return outputs.length;
    }
}
