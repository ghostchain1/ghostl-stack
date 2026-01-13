// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Tracks approved upgrades / implementation hashes with optional activation time.
contract UpgradeManager is Ownable {
    struct UpgradeProposal {
        bytes32 implHash;
        uint256 activateAt;
        bool executed;
    }

    UpgradeProposal[] public proposals;

    event UpgradeProposed(uint256 indexed id, bytes32 implHash, uint256 activateAt);
    event UpgradeExecuted(uint256 indexed id);

    function propose(bytes32 implHash, uint256 activateAt) external onlyOwner returns (uint256 id) {
        id = proposals.length;
        proposals.push(UpgradeProposal({implHash: implHash, activateAt: activateAt, executed: false}));
        emit UpgradeProposed(id, implHash, activateAt);
    }

    function execute(uint256 id) external onlyOwner {
        UpgradeProposal storage p = proposals[id];
        require(!p.executed, "executed");
        require(block.timestamp >= p.activateAt, "too early");
        p.executed = true;
        emit UpgradeExecuted(id);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }
}
