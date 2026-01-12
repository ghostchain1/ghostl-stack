// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IXDomainMessenger {
    function xDomainMessageSender() external view returns (address);

    function sendMessage(address target, bytes calldata message, uint32 minGasLimit) external payable;

    function relayMessage(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        uint32 minGasLimit,
        bytes calldata message
    ) external;
}
