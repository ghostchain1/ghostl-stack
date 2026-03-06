// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./Ownable.sol";

/// @notice Governance helper that restricts sensitive setters to ProposalExecutor calls.
/// @dev We reuse the existing governor/timelock slots to avoid storage layout churn:
///      - governor => ProposalExecutor (v1)
///      - timelock => ProposalExecutorV2 (optional)
contract Governed is Ownable {
    address public governor;
    address public timelock;

    event GovernanceConfigUpdated(address indexed governor, address indexed timelock);

    constructor(address governor_, address timelock_) {
        governor = governor_ == address(0) ? msg.sender : governor_;
        timelock = timelock_;
        emit GovernanceConfigUpdated(governor, timelock);
    }

    modifier onlyExecutor() {
        require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        _;
    }

    function setGovernance(address governor_, address timelock_) external onlyExecutor {
        require(governor_ != address(0), "governor=0");
        governor = governor_;
        timelock = timelock_;
        emit GovernanceConfigUpdated(governor_, timelock_);
    }
}
