// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Minimal staking manager to track staked ETH and balances for validators.
contract StakingManager is Ownable {
    mapping(address => uint256) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event Slashed(address indexed staker, uint256 amount);

    function stake() external payable {
        require(msg.value > 0, "no value");
        stakes[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "insufficient stake");
        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        payable(msg.sender).transfer(amount);
        emit Unstaked(msg.sender, amount);
    }

    function slash(address staker, uint256 amount) external onlyOwner {
        uint256 bal = stakes[staker];
        if (amount > bal) amount = bal;
        stakes[staker] = bal - amount;
        totalStaked -= amount;
        emit Slashed(staker, amount);
    }
}
