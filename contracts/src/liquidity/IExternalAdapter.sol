// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Extension point for future on-chain adapters that abstract bridging and external execution.
/// @dev MVP supports operator custody (adapter.operator). Production custody should prefer bridge escrow (BridgeEscrow + StandardBridge)
///      and proof-based reconciliation where possible.
interface IExternalAdapter {
    function deploy(address asset, uint256 amount, bytes32 strategyId, bytes calldata params) external;
    function unwind(address asset, uint256 amount, bytes calldata params) external;
    function claimRewards(bytes calldata params) external returns (bytes32 commitment);
}
