// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IGRC20
 * @notice Ghost Token Standard — GRC20 (replaces ERC20).
 * @dev All GhostStack fungible tokens must implement this interface.
 *      Use GRC20 everywhere; ERC20 references are rejected by GhostCompilerHooks.
 */
interface IGRC20 {
    /// @notice Emitted when tokens are transferred.
    event GhostTransfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when an allowance is set.
    event GhostApproval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Returns the token name.
    function name() external view returns (string memory);

    /// @notice Returns the token symbol.
    function symbol() external view returns (string memory);

    /// @notice Returns the number of decimals.
    function decimals() external view returns (uint8);

    /// @notice Returns the total token supply.
    function totalSupply() external view returns (uint256);

    /// @notice Returns the token balance of `account`.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Transfers `amount` tokens to `to`.
    function transfer(address to, uint256 amount) external returns (bool);

    /// @notice Returns remaining tokens that `spender` can transfer on behalf of `owner`.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Approves `spender` to spend `amount` on behalf of the caller.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` from `from` to `to` using allowance.
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
