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

    /// #if_succeeds {:msg "only owner withdraw ETH"} msg.sender == owner();
    /// #if_succeeds {:msg "eth balance decreases"} address(this).balance == old(address(this).balance) - amount;
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "insufficient ETH");
        to.transfer(amount);
        emit WithdrawETH(to, amount);
    }

    /// #if_succeeds {:msg "only owner withdraw native"} msg.sender == owner();
    /// #if_succeeds {:msg "native balance decreases"} native.balanceOf(address(this)) == old(native.balanceOf(address(this))) - amount;
    function withdrawNative(address to, uint256 amount) external onlyOwner {
        native.transfer(to, amount);
        emit WithdrawNative(to, amount);
    }
}
