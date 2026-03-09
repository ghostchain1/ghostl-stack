// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

// GhostChain Contracts v5.6.1 (contracts/src/ghostx/GhostXRouter.sol)

import { GhostXFactory } from "./GhostXFactory.sol";
import { GhostXPair }    from "./GhostXPair.sol";

/**
 * @title GhostXRouter — GhostXchange User-Facing Router
 * @notice Routes swaps and liquidity operations with slippage protection
 *         and deadline enforcement.
 *
 *         Supports:
 *           - addLiquidity / removeLiquidity (GRC-20 pair)
 *           - swapExactTokensForTokens (exact in, minimum out)
 *           - swapTokensForExactTokens (maximum in, exact out)
 *           - getAmountOut / getAmountIn (view quote helpers)
 *
 * @dev All token.transferFrom calls are require-wrapped
 *      (Forge lint: erc20-unchecked-transfer).
 */
contract GhostXRouter {
    // ── State ─────────────────────────────────────────────────────────────────

    address public immutable FACTORY;

    // ── Events ────────────────────────────────────────────────────────────────

    event LiquidityAdded(
        address indexed pair,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed pair,
        address indexed provider,
        uint256 amount0,
        uint256 amount1
    );
    event SwapExecuted(
        address indexed pair,
        address indexed recipient,
        uint256 amountIn,
        uint256 amountOut
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error Expired();
    error SlippageExceeded();
    error PairNotFound();
    error InsufficientAmount();

    // ── Modifier ─────────────────────────────────────────────────────────────

    modifier notExpired(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address factory) {
        require(factory != address(0), "GhostXRouter: zero factory");
        FACTORY = factory;
    }

    // ── Add liquidity ─────────────────────────────────────────────────────────

    /**
     * @notice Adds liquidity to the tokenA/tokenB pair.
     *         Creates the pair via the factory if it does not exist.
     * @param tokenA         First token address.
     * @param tokenB         Second token address.
     * @param amountADesired Ideal amount of tokenA to contribute.
     * @param amountBDesired Ideal amount of tokenB to contribute.
     * @param amountAMin     Minimum acceptable tokenA contribution (slippage guard).
     * @param amountBMin     Minimum acceptable tokenB contribution (slippage guard).
     * @param to             LP token recipient.
     * @param deadline       Unix timestamp after which the tx reverts.
     * @return amountA   Actual tokenA contributed.
     * @return amountB   Actual tokenB contributed.
     * @return liquidity LP tokens minted.
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pair = GhostXFactory(FACTORY).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = GhostXFactory(FACTORY).createPair(tokenA, tokenB);
        }

        (amountA, amountB) = _computeAmounts(
            pair, tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin
        );

        bool ok0 = _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        require(ok0, "GhostXRouter: tokenA transferFrom failed");
        bool ok1 = _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        require(ok1, "GhostXRouter: tokenB transferFrom failed");

        liquidity = GhostXPair(pair).addLiquidity(to);
        emit LiquidityAdded(pair, to, amountA, amountB, liquidity);
    }

    // ── Remove liquidity ──────────────────────────────────────────────────────

    /**
     * @notice Removes liquidity from the tokenA/tokenB pair.
     * @param tokenA    First token address.
     * @param tokenB    Second token address.
     * @param liquidity Amount of LP tokens to burn (must approve router first).
     * @param amountAMin Minimum tokenA to receive.
     * @param amountBMin Minimum tokenB to receive.
     * @param to        Recipient of the underlying tokens.
     * @param deadline  Unix timestamp after which the tx reverts.
     * @return amountA Received tokenA.
     * @return amountB Received tokenB.
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = GhostXFactory(FACTORY).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound();

        bool ok = _safeTransferFrom(pair, msg.sender, pair, liquidity);
        require(ok, "GhostXRouter: LP transferFrom failed");

        (uint256 out0, uint256 out1) = GhostXPair(pair).removeLiquidity(to);

        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (out0, out1) : (out1, out0);
        if (amountA < amountAMin || amountB < amountBMin) revert SlippageExceeded();

        emit LiquidityRemoved(pair, msg.sender, amountA, amountB);
    }

    // ── Swap exact in ─────────────────────────────────────────────────────────

    /**
     * @notice Swaps an exact amount of tokenIn for as much tokenOut as possible.
     * @param amountIn     Amount of tokenIn to sell.
     * @param amountOutMin Minimum tokenOut to accept (slippage guard).
     * @param tokenIn      Input token.
     * @param tokenOut     Output token.
     * @param to           Recipient.
     * @param deadline     Unix timestamp deadline.
     * @return amountOut   Actual tokenOut received.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountOut) {
        address pair = GhostXFactory(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();

        bool ok = _safeTransferFrom(tokenIn, msg.sender, pair, amountIn);
        require(ok, "GhostXRouter: transferFrom failed");

        (uint112 res0, uint112 res1,) = GhostXPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));

        amountOut = _getAmountOut(amountIn, resIn, resOut);
        if (amountOut < amountOutMin) revert SlippageExceeded();

        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));

        GhostXPair(pair).swap(amount0Out, amount1Out, to);
        emit SwapExecuted(pair, to, amountIn, amountOut);
    }

    // ── Swap exact out ────────────────────────────────────────────────────────

    /**
     * @notice Swaps as little tokenIn as possible to receive an exact amount of tokenOut.
     * @param amountOut  Desired output amount.
     * @param amountInMax Maximum input accepted (slippage guard).
     * @param tokenIn    Input token.
     * @param tokenOut   Output token.
     * @param to         Recipient.
     * @param deadline   Unix timestamp deadline.
     * @return amountIn  Actual tokenIn spent.
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountIn) {
        address pair = GhostXFactory(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();

        (uint112 res0, uint112 res1,) = GhostXPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));

        amountIn = _getAmountIn(amountOut, resIn, resOut);
        if (amountIn > amountInMax) revert SlippageExceeded();

        bool ok = _safeTransferFrom(tokenIn, msg.sender, pair, amountIn);
        require(ok, "GhostXRouter: transferFrom failed");

        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));

        GhostXPair(pair).swap(amount0Out, amount1Out, to);
        emit SwapExecuted(pair, to, amountIn, amountOut);
    }

    // ── Quote helpers (view) ──────────────────────────────────────────────────

    /// @notice Returns the output for a given input amount given current reserves.
    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        address pair = GhostXFactory(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();
        (uint112 res0, uint112 res1,) = GhostXPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));
        return _getAmountOut(amountIn, resIn, resOut);
    }

    /// @notice Returns the required input for a given output amount given current reserves.
    function getAmountIn(uint256 amountOut, address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        address pair = GhostXFactory(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();
        (uint112 res0, uint112 res1,) = GhostXPair(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));
        return _getAmountIn(amountOut, resIn, resOut);
    }

    // ── Internal AMM math ─────────────────────────────────────────────────────

    /// @dev 0.3% fee formula: amountOut = (amountIn * 997 * resOut) / (resIn * 1000 + amountIn * 997)
    function _getAmountOut(uint256 amountIn, uint256 resIn, uint256 resOut)
        internal
        pure
        returns (uint256)
    {
        if (amountIn == 0 || resIn == 0 || resOut == 0) revert InsufficientAmount();
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * resOut) / (resIn * 1_000 + amountInWithFee);
    }

    /// @dev 0.3% fee formula: amountIn = ceil((resIn * amountOut * 1000) / ((resOut - amountOut) * 997))
    function _getAmountIn(uint256 amountOut, uint256 resIn, uint256 resOut)
        internal
        pure
        returns (uint256)
    {
        if (amountOut == 0 || resIn == 0 || resOut == 0 || amountOut >= resOut) {
            revert InsufficientAmount();
        }
        return ((resIn * amountOut * 1_000) / ((resOut - amountOut) * 997)) + 1;
    }

    /// @dev Returns tokens in sorted (token0 < token1) order.
    function _sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /// @dev Computes optimal deposit amounts respecting current reserves and slippage.
    function _computeAmounts(
        address pair,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint112 res0, uint112 res1,) = GhostXPair(pair).getReserves();
        if (res0 == 0 && res1 == 0) {
            // No liquidity yet — accept desired amounts as-is.
            return (amountADesired, amountBDesired);
        }
        (address token0,) = _sortTokens(tokenA, tokenB);
        (uint256 resA, uint256 resB) = tokenA == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));

        uint256 amountBOptimal = (amountADesired * resB) / resA;
        if (amountBOptimal <= amountBDesired) {
            if (amountBOptimal < amountBMin) revert SlippageExceeded();
            return (amountADesired, amountBOptimal);
        } else {
            uint256 amountAOptimal = (amountBDesired * resA) / resB;
            if (amountAOptimal < amountAMin) revert SlippageExceeded();
            return (amountAOptimal, amountBDesired);
        }
    }

    /// @dev Safe transferFrom — checks the GRC-20 boolean return.
    ///      Satisfies Forge lint: erc20-unchecked-transfer.
    function _safeTransferFrom(address token, address from, address to, uint256 amount)
        internal
        returns (bool)
    {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
