// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (interfaces/draft-IGRC7802.sol)

pragma solidity >=0.6.2;

import {IGST165} from "./IGST165.sol";

/// @title IGRC7802
/// @notice Defines the interface for crosschain GRC20 transfers.
interface IGRC7802 is IGST165 {
    /// @notice Emitted when a crosschain transfer mints tokens.
    /// @param to       Address of the account tokens are being minted for.
    /// @param amount   Amount of tokens minted.
    /// @param sender   Address of the caller (msg.sender) who invoked crosschainMint.
    event CrosschainMint(address indexed to, uint256 amount, address indexed sender);

    /// @notice Emitted when a crosschain transfer burns tokens.
    /// @param from     Address of the account tokens are being burned from.
    /// @param amount   Amount of tokens burned.
    /// @param sender   Address of the caller (msg.sender) who invoked crosschainBurn.
    event CrosschainBurn(address indexed from, uint256 amount, address indexed sender);

    /// @notice Mint tokens through a crosschain transfer.
    /// @param _to     Address to mint tokens to.
    /// @param _amount Amount of tokens to mint.
    function crosschainMint(address _to, uint256 _amount) external;

    /// @notice Burn tokens through a crosschain transfer.
    /// @param _from   Address to burn tokens from.
    /// @param _amount Amount of tokens to burn.
    function crosschainBurn(address _from, uint256 _amount) external;
}
