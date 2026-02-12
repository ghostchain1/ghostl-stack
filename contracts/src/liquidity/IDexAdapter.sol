// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adapter interface for on-chain buyback + POL provisioning.
/// @dev Implementations are expected to be governance-reviewed and limited to approved DEX venues.
interface IDexAdapter {
    /// @notice Swap exact input tokens for output tokens, enforcing `maxSlippageBps` internally.
    /// @dev Caller must have approved the adapter to spend `amountIn` of `tokenIn`.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint16 maxSlippageBps, address recipient)
        external
        returns (uint256 amountOut);

    /// @notice Provide one-sided liquidity by swapping part of `amountIn` into `tokenOut` and adding liquidity.
    /// @dev Caller must have approved the adapter to spend `amountIn` of `tokenIn`.
    function provideLiquidityOneSided(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 maxSlippageBps,
        address recipient
    ) external returns (uint256 lpMinted);
}

