// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghostswap/GhostRouter.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { IGhostFactory, IGhostPair, IGhostRouter, IGST20, IWGST } from "./IGhostSwap.sol";

/// @title GhostRouter
/// @notice Periphery router for the GhostSwap constant-product AMM.
///         Handles multi-hop token swaps, liquidity add/remove, and native GST wrapping.
///
///         Design based on the battle-tested Uniswap V2 Router02, rebranded for GhostChain.
///
///         Key concepts:
///           - All GST-denominated paths wrap/unwrap automatically via WGST9/WGST10.
///           - `deadline` enforcement prevents stale transactions from executing.
///           - Tokens are pulled directly from `msg.sender` via `transferFrom` — the user
///             must approve this router beforehand.
///           - The Router never holds a persistent token or GST balance; any native GST
///             left over after `addLiquidityGST` is refunded to the caller.
///
/// @dev Deployed once per layer (L1, L2, L3).  Point each deployment at the layer-local
///      GhostFactory and WGST9 instances.
contract GhostRouter is GhostBrand, IGhostRouter {
    // ─────────────────────── Immutables ──────────────────────────────────────

    /// @inheritdoc IGhostRouter
    address public immutable override factory;

    /// @inheritdoc IGhostRouter
    address public immutable override WGST;

    // ─────────────────────── Init ────────────────────────────────────────────

    constructor(address _factory, address _wgst) {
        require(_factory != address(0), "GhostRouter: zero factory");
        require(_wgst    != address(0), "GhostRouter: zero WGST");
        factory = _factory;
        WGST    = _wgst;
    }

    // ─────────────────────── Modifiers ───────────────────────────────────────

    modifier ensure(uint256 deadline) {
        _ensureDeadline(deadline);
        _;
    }

    function _ensureDeadline(uint256 deadline) internal view {
        require(deadline >= block.timestamp, "GhostRouter: EXPIRED");
    }

    // ─────────────────────── Receive (refund path) ───────────────────────────

    /// @notice Accepts native GST only from WGST (during withdraw unwrap).
    receive() external payable {
        require(msg.sender == WGST, "GhostRouter: only WGST");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // QUOTE HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IGhostRouter
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        public
        pure
        override
        returns (uint256 amountB)
    {
        require(amountA > 0,      "GhostRouter: ZERO_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "GhostRouter: ZERO_RESERVES");
        amountB = amountA * reserveB / reserveA;
    }

    /// @inheritdoc IGhostRouter
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        override
        returns (uint256 amountOut)
    {
        require(amountIn  > 0, "GhostRouter: ZERO_INPUT");
        require(reserveIn > 0 && reserveOut > 0, "GhostRouter: ZERO_RESERVES");
        // 0.3% fee: amountInWithFee = amountIn * 997
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator       = amountInWithFee * reserveOut;
        uint256 denominator     = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @inheritdoc IGhostRouter
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        override
        returns (uint256 amountIn)
    {
        require(amountOut  > 0, "GhostRouter: ZERO_OUTPUT");
        require(reserveIn  > 0 && reserveOut > 0, "GhostRouter: ZERO_RESERVES");
        uint256 numerator   = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    /// @inheritdoc IGhostRouter
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "GhostRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; ++i) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /// @inheritdoc IGhostRouter
    function getAmountsIn(uint256 amountOut, address[] calldata path)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "GhostRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; --i) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ADD LIQUIDITY
    // ═════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IGhostRouter
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        override
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        (amountA, amountB) = _computeLiquidityAmounts(
            tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin
        );
        address pair = _pairFor(tokenA, tokenB);
        require(IGST20(tokenA).transferFrom(msg.sender, pair, amountA), "GhostRouter: transferFrom A failed");
        require(IGST20(tokenB).transferFrom(msg.sender, pair, amountB), "GhostRouter: transferFrom B failed");
        liquidity = IGhostPair(pair).mint(to);
    }

    /// @inheritdoc IGhostRouter
    function addLiquidityGST(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountGSTMin,
        address to,
        uint256 deadline
    )
        external
        payable
        override
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountGST, uint256 liquidity)
    {
        (amountToken, amountGST) = _computeLiquidityAmounts(
            token, WGST, amountTokenDesired, msg.value, amountTokenMin, amountGSTMin
        );
        address pair = _pairFor(token, WGST);

        // Pull token from caller.
        require(IGST20(token).transferFrom(msg.sender, pair, amountToken), "GhostRouter: transferFrom token failed");

        // Wrap the exact GST amount needed.
        IWGST(WGST).deposit{value: amountGST}();
        require(IGST20(WGST).transfer(pair, amountGST), "GhostRouter: WGST transfer failed");

        liquidity = IGhostPair(pair).mint(to);

        // Refund any excess native GST sent by the caller.
        if (msg.value > amountGST) {
            uint256 refund = msg.value - amountGST;
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "GhostRouter: GST refund failed");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // REMOVE LIQUIDITY
    // ═════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IGhostRouter
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        public
        override
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB)
    {
        address pair = _pairFor(tokenA, tokenB);
        // Transfer LP tokens from caller to pair.
        require(IGhostPair(pair).transferFrom(msg.sender, pair, liquidity), "GhostRouter: LP transferFrom failed");
        (uint256 amount0, uint256 amount1) = IGhostPair(pair).burn(to);

        // Sort to match (amountA, amountB) ordering.
        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0
            ? (amount0, amount1)
            : (amount1, amount0);

        require(amountA >= amountAMin, "GhostRouter: INSUFFICIENT_A");
        require(amountB >= amountBMin, "GhostRouter: INSUFFICIENT_B");
    }

    /// @inheritdoc IGhostRouter
    function removeLiquidityGST(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountGSTMin,
        address to,
        uint256 deadline
    )
        public
        override
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountGST)
    {
        // Burn LP tokens; receive token + WGST here (router as recipient).
        (amountToken, amountGST) = removeLiquidity(
            token, WGST, liquidity, amountTokenMin, amountGSTMin, address(this), deadline
        );

        // Send the ERC-20 token directly to the caller.
        require(IGST20(token).transfer(to, amountToken), "GhostRouter: token transfer failed");

        // Unwrap WGST → native GST and send to caller.
        IWGST(WGST).withdraw(amountGST);
        (bool ok,) = to.call{value: amountGST}("");
        require(ok, "GhostRouter: GST send failed");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SWAPS — exact in
    // ═════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IGhostRouter
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        override
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GhostRouter: INSUFFICIENT_OUTPUT");

        // Pull first token from caller into first pair.
        require(
            IGST20(path[0]).transferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]),
            "GhostRouter: transferFrom failed"
        );
        _swapAlongPath(amounts, path, to);
    }

    /// @inheritdoc IGhostRouter
    function swapExactGSTForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        override
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WGST, "GhostRouter: INVALID_PATH");
        amounts = getAmountsOut(msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GhostRouter: INSUFFICIENT_OUTPUT");

        // Wrap native GST → WGST, send directly to first pair.
        IWGST(WGST).deposit{value: amounts[0]}();
        require(IGST20(WGST).transfer(_pairFor(path[0], path[1]), amounts[0]), "GhostRouter: WGST transfer failed");
        _swapAlongPath(amounts, path, to);
    }

    /// @inheritdoc IGhostRouter
    function swapExactTokensForGST(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        override
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[path.length - 1] == WGST, "GhostRouter: INVALID_PATH");
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "GhostRouter: INSUFFICIENT_OUTPUT");

        // Pull first token, swap output (WGST) lands on this router.
        require(
            IGST20(path[0]).transferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]),
            "GhostRouter: transferFrom failed"
        );
        _swapAlongPath(amounts, path, address(this));

        // Unwrap WGST → native GST and forward to caller.
        IWGST(WGST).withdraw(amounts[amounts.length - 1]);
        (bool ok,) = to.call{value: amounts[amounts.length - 1]}("");
        require(ok, "GhostRouter: GST send failed");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Sort two token addresses (token0 < token1).
    function _sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        require(tokenA != tokenB, "GhostRouter: IDENTICAL_TOKENS");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "GhostRouter: ZERO_ADDRESS");
    }

    /// @dev Compute the CREATE2 GhostPair address for (tokenA, tokenB) without a factory call.
    function _pairFor(address tokenA, address tokenB) internal view returns (address pair) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        pair = IGhostFactory(factory).getPair(token0, token1);
        require(pair != address(0), "GhostRouter: PAIR_NOT_FOUND");
    }

    /// @dev Fetch sorted reserves for (tokenA, tokenB) from their pair.
    function _getReserves(address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = _sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1,) = IGhostPair(_pairFor(tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    /// @dev Compute optimal liquidity amounts given desired + minimum bounds.
    function _computeLiquidityAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    )
        internal
        returns (uint256 amountA, uint256 amountB)
    {
        // Create pair if it does not yet exist.
        if (IGhostFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IGhostFactory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            // Empty pool — use the full desired amounts (price discovery).
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "GhostRouter: INSUFFICIENT_B");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired, "GhostRouter: EXCESS_A");
                require(amountAOptimal >= amountAMin,     "GhostRouter: INSUFFICIENT_A");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    /// @dev Execute a multi-hop swap sequence; `amounts` and `path` are already validated.
    function _swapAlongPath(
        uint256[] memory amounts,
        address[] calldata path,
        address finalRecipient
    )
        internal
    {
        for (uint256 i; i < path.length - 1; ++i) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = _sortTokens(input, output);

            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));

            // Send output to the next pair (for further hops) or to the final recipient.
            address recipient = i < path.length - 2
                ? _pairFor(output, path[i + 2])
                : finalRecipient;

            IGhostPair(_pairFor(input, output)).swap(amount0Out, amount1Out, recipient, new bytes(0));
        }
    }
}
