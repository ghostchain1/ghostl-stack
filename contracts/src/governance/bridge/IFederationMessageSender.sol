// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal message-sending interface for federation governance.
/// @dev Bridge-agnostic. Implementations must provide authenticated sender on destination and execute the message.
interface IFederationMessageSender {
    function sendMessage(address target, bytes calldata message, uint32 minGasLimit) external;
}

