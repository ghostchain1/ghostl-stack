// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../amm/MinimalAMM.sol";
import "./IDexAdapter.sol";

interface IGST20Dex {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Dev adapter for `MinimalAMM` to support on-chain buyback + POL provisioning.
/// @dev Production deployments should use a canonical GhostChain DEX adapter (UniswapV2/CL/etc).
contract MinimalAmmDexAdapter is IDexAdapter {
    uint16 public constant BPS_DENOM = 10_000;

    MinimalAMM public immutable amm;

    constructor(MinimalAMM amm_) {
        require(address(amm_) != address(0), "amm=0");
        amm = amm_;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint16 maxSlippageBps, address recipient)
        external
        returns (uint256 amountOut)
    {
        require(recipient != address(0), "recipient=0");
        require(amountIn != 0, "amountIn=0");
        require(maxSlippageBps <= BPS_DENOM, "slippage");

        (address t0, address t1) = (address(amm.token0()), address(amm.token1()));
        require((tokenIn == t0 && tokenOut == t1) || (tokenIn == t1 && tokenOut == t0), "pair");

        require(IGST20Dex(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pullIn");
        _approve(tokenIn, address(amm), amountIn);

        uint256 expectedOut = _quoteOut(tokenIn, amountIn);
        uint256 minOut = (expectedOut * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;
        amountOut = amm.swapExactIn(tokenIn, amountIn, minOut);

        require(IGST20Dex(tokenOut).transfer(recipient, amountOut), "sendOut");
    }

    function provideLiquidityOneSided(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 maxSlippageBps,
        address recipient
    ) external returns (uint256 lpMinted) {
        require(recipient != address(0), "recipient=0");
        require(amountIn != 0, "amountIn=0");
        require(maxSlippageBps <= BPS_DENOM, "slippage");

        (address t0, address t1) = (address(amm.token0()), address(amm.token1()));
        require((tokenIn == t0 && tokenOut == t1) || (tokenIn == t1 && tokenOut == t0), "pair");

        require(IGST20Dex(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pullIn");

        uint256 amountSwap = amountIn / 2;
        uint256 amountRemain = amountIn - amountSwap;

        // Swap half into tokenOut.
        _approve(tokenIn, address(amm), amountSwap);
        uint256 expectedOut = _quoteOut(tokenIn, amountSwap);
        uint256 minOut = (expectedOut * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;
        uint256 amountOut = amm.swapExactIn(tokenIn, amountSwap, minOut);

        // Compute optimal amounts for liquidity add.
        (uint256 amount0Desired, uint256 amount1Desired) = tokenIn == t0
            ? (amountRemain, amountOut)
            : (amountOut, amountRemain);

        (uint112 r0, uint112 r1) = (amm.reserve0(), amm.reserve1());
        uint256 use0 = amount0Desired;
        uint256 use1 = amount1Desired;
        if (amm.totalLP() != 0) {
            require(r0 != 0 && r1 != 0, "empty");
            uint256 opt1 = (amount0Desired * uint256(r1)) / uint256(r0);
            if (opt1 <= amount1Desired) {
                use0 = amount0Desired;
                use1 = opt1;
            } else {
                uint256 opt0 = (amount1Desired * uint256(r0)) / uint256(r1);
                use0 = opt0;
                use1 = amount1Desired;
            }
        }

        require(use0 != 0 && use1 != 0, "liquidity=0");

        // Approve and add liquidity.
        _approve(t0, address(amm), use0);
        _approve(t1, address(amm), use1);
        lpMinted = amm.addLiquidity(use0, use1);

        // Send LP + any unused token balances to recipient.
        require(amm.transfer(recipient, lpMinted), "lp xfer");

        uint256 refund0 = amount0Desired > use0 ? amount0Desired - use0 : 0;
        uint256 refund1 = amount1Desired > use1 ? amount1Desired - use1 : 0;
        if (refund0 != 0) {
            require(IGST20Dex(t0).transfer(recipient, refund0), "refund0");
        }
        if (refund1 != 0) {
            require(IGST20Dex(t1).transfer(recipient, refund1), "refund1");
        }
    }

    function _quoteOut(address tokenIn, uint256 amountIn) internal view returns (uint256 amountOut) {
        (uint112 r0, uint112 r1) = (amm.reserve0(), amm.reserve1());
        require(r0 != 0 && r1 != 0, "empty");
        bool in0 = tokenIn == address(amm.token0());
        uint256 reserveIn = in0 ? uint256(r0) : uint256(r1);
        uint256 reserveOut = in0 ? uint256(r1) : uint256(r0);
        amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    function _approve(address token, address spender, uint256 amount) internal {
        require(IGST20Dex(token).approve(spender, 0), "approve0");
        require(IGST20Dex(token).approve(spender, amount), "approve");
    }
}

