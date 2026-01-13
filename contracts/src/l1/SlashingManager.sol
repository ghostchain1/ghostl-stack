// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "./StakingManager.sol";

/// @notice Coordinates slashing events; delegates balance updates to StakingManager.
contract SlashingManager is Ownable {
    StakingManager public staking;

    event Slashed(address indexed staker, uint256 amount, string reason);

    constructor(StakingManager _staking) {
        staking = _staking;
    }

    function setStakingManager(StakingManager _staking) external onlyOwner {
        staking = _staking;
    }

    function slash(address staker, uint256 amount, string calldata reason) external onlyOwner {
        staking.slash(staker, amount);
        emit Slashed(staker, amount, reason);
    }
}
