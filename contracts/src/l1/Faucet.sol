// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice ETH faucet with a per-address cooldown to seed devnet wallets.
contract Faucet is Ownable {
    uint256 public dripAmount;
    uint256 public cooldown;
    mapping(address => uint256) public lastDrip;

    event Dripped(address indexed to, uint256 amount);
    event ConfigUpdated(uint256 dripAmount, uint256 cooldown);

    constructor(uint256 _dripAmount, uint256 _cooldownSeconds) payable {
        dripAmount = _dripAmount;
        cooldown = _cooldownSeconds;
    }

    function setConfig(uint256 _dripAmount, uint256 _cooldownSeconds) external onlyOwner {
        dripAmount = _dripAmount;
        cooldown = _cooldownSeconds;
        emit ConfigUpdated(_dripAmount, _cooldownSeconds);
    }

    function fund() external payable {}

    function drip(address to) external {
        require(address(this).balance >= dripAmount, "insufficient balance");
        uint256 last = lastDrip[to];
        require(block.timestamp >= last + cooldown, "cooldown");
        lastDrip[to] = block.timestamp;
        (bool ok, ) = to.call{value: dripAmount}("");
        require(ok, "send failed");
        emit Dripped(to, dripAmount);
    }
}
