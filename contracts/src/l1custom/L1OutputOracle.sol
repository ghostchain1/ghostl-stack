// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import {LibErrors} from "../common/LibErrors.sol";

/// @notice Minimal output oracle to publish L2 outputs on L1.
contract L1OutputOracle {
    event OutputProposed(uint256 indexed l2BlockNumber, bytes32 outputRoot, address proposer);

    address public proposer;
    address public owner;

    struct Output {
        bytes32 root;
        uint256 l2BlockNumber;
    }

    Output public latest;

    modifier onlyOwner() {
        if (msg.sender != owner) revert LibErrors.NotOwner();
        _;
    }

    modifier onlyProposer() {
        if (msg.sender != proposer) revert LibErrors.NotAuthorized();
        _;
    }

    constructor(address _proposer) {
        owner = msg.sender;
        proposer = _proposer;
    }

    function setProposer(address _proposer) external onlyOwner {
        proposer = _proposer;
    }

    function proposeOutput(bytes32 outputRoot, uint256 l2BlockNumber) external onlyProposer {
        latest = Output({root: outputRoot, l2BlockNumber: l2BlockNumber});
        emit OutputProposed(l2BlockNumber, outputRoot, msg.sender);
    }

    function version() external pure returns (string memory) {
        return "1.0.0-custom";
    }
}
