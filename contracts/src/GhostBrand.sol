// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostBrand
/// @notice Canonical branding constants for the GhostChain protocol.
///         Inherit or reference this contract anywhere GST / Ghost naming is needed.
///         Using GST_UNIT instead of the `ether` keyword ensures consistent
///         Ghost-native denomination throughout all GhostStack contracts.
abstract contract GhostBrand {
    /// @notice Human-readable name of the native currency.
    string internal constant GHOST_NAME    = "Ghost";

    /// @notice Ticker symbol of the native currency.
    string internal constant GHOST_SYMBOL  = "GST";

    /// @notice Decimals — same as standard EVM native (10^18 base units per GST).
    uint8  internal constant GHOST_DECIMALS = 18;

    /// @notice One whole GST unit (10^18 base units).
    ///         Use instead of the raw `ether` keyword in all GhostStack contracts:
    ///         `vm.deal(user, 10 * GST_UNIT)` // 10 GST
    uint256 internal constant GST_UNIT = 1e18;

    /// @notice Canonical gas token ERC20 address — consistent across all layers.
    ///         Deployed deterministically as the first contract from the genesis deployer.
    address internal constant CANONICAL_GST = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    /// @notice Chain IDs for each GhostStack layer.
    uint256 internal constant L1_CHAIN_ID = 14000101;
    uint256 internal constant L2_CHAIN_ID = 901;
    uint256 internal constant L3_CHAIN_ID = 903;

    error ForeignCurrencyReference();
}
