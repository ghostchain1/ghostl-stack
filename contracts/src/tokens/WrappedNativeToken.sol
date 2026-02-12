// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ERC20.sol";

/// @notice WETH-like wrapper for the native gas token (ETH in dev).
/// @dev Intended for bridge-escrow custody of native principal. Production should use the canonical wrapped-native token.
contract WrappedNativeToken is ERC20 {
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_, 18) {}

    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "native send");
        emit Withdrawn(msg.sender, amount);
    }
}

