// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for AI-driven transaction gating and policy enforcement.
interface IAITransactionGuard {
    function checkTransaction(bytes32 operationId) external view returns (bool allowed, uint64 waitSeconds, bytes32 reason);

    function computeOperationId(
        address actor,
        address target,
        bytes4 selector,
        bytes calldata data,
        uint256 value
    ) external view returns (bytes32);
}
