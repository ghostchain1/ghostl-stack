// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IERC20FaucetToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Canonical GST faucet with a per-address cooldown to seed devnet wallets.
contract Faucet is Governed {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    IERC20FaucetToken public immutable gasToken;
    uint256 public dripAmount;
    uint256 public cooldown;
    mapping(address => uint256) public lastDrip;

    event Dripped(address indexed to, uint256 amount);
    event ConfigUpdated(uint256 dripAmount, uint256 cooldown);

    constructor(uint256 _dripAmount, uint256 _cooldownSeconds, address governor_, address timelock_)
        Governed(governor_, timelock_)
    {
        gasToken = IERC20FaucetToken(CANONICAL_GAS_TOKEN);
        dripAmount = _dripAmount;
        cooldown = _cooldownSeconds;
    }

    function setConfig(uint256 _dripAmount, uint256 _cooldownSeconds) external onlyGovernance {
        dripAmount = _dripAmount;
        cooldown = _cooldownSeconds;
        emit ConfigUpdated(_dripAmount, _cooldownSeconds);
    }

    function fund(uint256 amount) external {
        require(amount > 0, "no amount");
        require(gasToken.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
    }

    function drip(address to) external {
        require(gasToken.balanceOf(address(this)) >= dripAmount, "insufficient balance");
        require(to == msg.sender, "self only");
        uint256 last = lastDrip[to];
        require(block.timestamp >= last + cooldown, "cooldown");
        lastDrip[to] = block.timestamp;
        require(gasToken.transfer(to, dripAmount), "transfer failed");
        emit Dripped(to, dripAmount);
    }

    function gasTokenAddress() external pure returns (address) {
        return CANONICAL_GAS_TOKEN;
    }
}
