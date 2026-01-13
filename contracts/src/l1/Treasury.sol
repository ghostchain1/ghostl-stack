// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "./NativeToken.sol";

/// @notice Simple treasury to hold ETH and native tokens.
contract Treasury is Ownable {
    NativeToken public immutable native;

    event WithdrawETH(address indexed to, uint256 amount);
    event WithdrawNative(address indexed to, uint256 amount);

    constructor(NativeToken _native) {
        native = _native;
    }

    receive() external payable {}

    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "insufficient ETH");
        to.transfer(amount);
        emit WithdrawETH(to, amount);
    }

    function withdrawNative(address to, uint256 amount) external onlyOwner {
        native.transfer(to, amount);
        emit WithdrawNative(to, amount);
    }
}
