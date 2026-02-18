// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./StakingManager.sol";

interface IERC20RewardToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Distributes canonical GST tokens to stakers based on share snapshots (naive implementation).
contract RewardDistributor is Governed {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    IERC20RewardToken public immutable rewardToken;
    StakingManager public staking;

    event Distributed(address indexed to, uint256 amount);

    constructor(StakingManager _staking, address governor_, address timelock_) Governed(governor_, timelock_) {
        rewardToken = IERC20RewardToken(CANONICAL_GAS_TOKEN);
        staking = _staking;
    }

    function setStakingManager(StakingManager _staking) external onlyGovernance {
        staking = _staking;
    }

    function distribute(address[] calldata stakers, uint256[] calldata amounts) external onlyGovernance {
        require(stakers.length == amounts.length, "len mismatch");
        for (uint256 i = 0; i < stakers.length; i++) {
            require(rewardToken.transfer(stakers[i], amounts[i]), "transfer failed");
            emit Distributed(stakers[i], amounts[i]);
        }
    }
}
