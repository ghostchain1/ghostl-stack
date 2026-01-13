// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "./NativeToken.sol";
import "./StakingManager.sol";

/// @notice Distributes native tokens to stakers based on share snapshots (naive implementation).
contract RewardDistributor is Ownable {
    NativeToken public immutable native;
    StakingManager public staking;

    event Distributed(address indexed to, uint256 amount);

    constructor(NativeToken _native, StakingManager _staking) {
        native = _native;
        staking = _staking;
    }

    function setStakingManager(StakingManager _staking) external onlyOwner {
        staking = _staking;
    }

    function distribute(address[] calldata stakers, uint256[] calldata amounts) external onlyOwner {
        require(stakers.length == amounts.length, "len mismatch");
        for (uint256 i = 0; i < stakers.length; i++) {
            native.transfer(stakers[i], amounts[i]);
            emit Distributed(stakers[i], amounts[i]);
        }
    }
}
