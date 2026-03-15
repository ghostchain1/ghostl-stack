// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghost/IGRC20.sol)
pragma solidity ^0.8.24;

/**
 * @title  IGRC20
 * @notice GhostChain fungible-token interface (GRC-20).
 *         ABI-identical to ERC-20 so bridges and tooling require no changes.
 *         Use instead of IERC20 throughout all GhostStack contracts.
 */
interface IGRC20 {
    /// @notice Emitted on every balance-changing transfer, including mint (from=0) and burn (to=0).
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when an owner updates a spender allowance.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
