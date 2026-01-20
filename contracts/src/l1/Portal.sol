// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Minimal deposit portal for L1->L2 messaging in a devnet.
// slither-disable-next-line locked-ether
contract Portal is Ownable {
    event ETHDeposit(address indexed from, address indexed to, uint256 amount, bytes data);
    event MessageSent(address indexed from, address indexed to, bytes data);

    function depositETH(address to, bytes calldata data) external payable {
        emit ETHDeposit(msg.sender, to, msg.value, data);
    }

    /// @dev placeholder for arbitrary L1->L2 message send.
    function sendMessage(address to, bytes calldata data) external payable {
        emit MessageSent(msg.sender, to, data);
    }
}
