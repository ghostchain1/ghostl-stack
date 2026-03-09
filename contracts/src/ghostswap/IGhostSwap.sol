// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghostswap/IGhostSwap.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

/// @notice Shared interfaces for the GhostSwap constant-product AMM.

// ─────────────────────────────────────────────────────────────────────────────
// IGhostPair
// ─────────────────────────────────────────────────────────────────────────────

interface IGhostPair {
    // ERC-20 LP token surface
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external pure returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    // Pair metadata
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    // AMM operations
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function sync() external;

    // Events
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);
}

// ─────────────────────────────────────────────────────────────────────────────
// IGhostFactory
// ─────────────────────────────────────────────────────────────────────────────

interface IGhostFactory {
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint256) external view returns (address pair);
    function allPairsLength() external view returns (uint256);
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function setFeeTo(address) external;
    function setFeeToSetter(address) external;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex);
}

// ─────────────────────────────────────────────────────────────────────────────
// IGhostRouter
// ─────────────────────────────────────────────────────────────────────────────

interface IGhostRouter {
    function factory() external view returns (address);
    function WGST() external view returns (address);

    // Liquidity (token-token)
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    // Liquidity (token + native GST)
    function addLiquidityGST(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountGSTMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountGST, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    function removeLiquidityGST(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountGSTMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountGST);

    // Swap (exact in → min out)
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactGSTForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForGST(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    // Quote helpers
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB);
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountOut);
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountIn);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts);
}

// ─────────────────────────────────────────────────────────────────────────────
// IGST20 (minimal interface used internally)
// ─────────────────────────────────────────────────────────────────────────────

interface IGST20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
// IWGST  (minimal WGST9/WGST10 interface used by Router)
// ─────────────────────────────────────────────────────────────────────────────

interface IWGST is IGST20 {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
}
