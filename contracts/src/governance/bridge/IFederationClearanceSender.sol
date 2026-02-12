// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adapter interface for delivering L1 clearance down to an execution chain.
/// @dev Bridge-agnostic: implemented by a chain-specific adapter that can execute a message on the destination chain.
interface IFederationClearanceSender {
    function sendClearance(
        address clearanceTarget,
        bytes32 proposalSalt,
        bytes32 attestationHash,
        uint32 minGasLimit
    ) external;
}

