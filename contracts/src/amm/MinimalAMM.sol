// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostSafeCast as SafeCast } from "../common/GhostSafeCast.sol";
import "../common/ReentrancyGuard.sol";

interface IGST20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Dev-only constant-product AMM for integration testing.
/// @dev Production deployments should integrate with the canonical GhostChain DEX.
contract MinimalAMM is ReentrancyGuard {
    using SafeCast for uint256;

    IGST20Minimal public immutable token0;
    IGST20Minimal public immutable token1;

    // Minimal GST20-like LP token (dev only).
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint112 public reserve0;
    uint112 public reserve1;

    uint256 public totalLP;
    mapping(address => uint256) public lpBalance;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    event Sync(uint112 reserve0, uint112 reserve1);
    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpBurned);
    event Swapped(address indexed user, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut);

    constructor(IGST20Minimal token0_, IGST20Minimal token1_) {
        require(address(token0_) != address(0) && address(token1_) != address(0), "token=0");
        require(address(token0_) != address(token1_), "same token");
        token0 = token0_;
        token1 = token1_;
        name = "Minimal AMM LP";
        symbol = "MIN-LP";
    }

    function totalSupply() external view returns (uint256) {
        return totalLP;
    }

    function balanceOf(address account) external view returns (uint256) {
        return lpBalance[account];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        unchecked {
            allowance[from][msg.sender] = a - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function addLiquidity(uint256 amount0, uint256 amount1) external nonReentrant returns (uint256 lpMinted) {
        require(amount0 != 0 && amount1 != 0, "amount=0");
        require(token0.transferFrom(msg.sender, address(this), amount0), "transfer0");
        require(token1.transferFrom(msg.sender, address(this), amount1), "transfer1");

        (uint112 r0, uint112 r1) = (reserve0, reserve1);
        if (totalLP == 0) {
            lpMinted = _sqrt(amount0 * amount1);
            require(lpMinted != 0, "lp=0");
        } else {
            uint256 lp0 = (amount0 * totalLP) / r0;
            uint256 lp1 = (amount1 * totalLP) / r1;
            lpMinted = lp0 < lp1 ? lp0 : lp1;
            require(lpMinted != 0, "lp=0");
        }

        totalLP += lpMinted;
        lpBalance[msg.sender] += lpMinted;
        emit Transfer(address(0), msg.sender, lpMinted);

        _sync();
        emit LiquidityAdded(msg.sender, amount0, amount1, lpMinted);
    }

    function removeLiquidity(uint256 lpBurned) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(lpBurned != 0, "lp=0");
        uint256 bal = lpBalance[msg.sender];
        require(bal >= lpBurned, "balance");

        (uint112 r0, uint112 r1) = (reserve0, reserve1);
        amount0 = (uint256(r0) * lpBurned) / totalLP;
        amount1 = (uint256(r1) * lpBurned) / totalLP;

        lpBalance[msg.sender] = bal - lpBurned;
        totalLP -= lpBurned;
        emit Transfer(msg.sender, address(0), lpBurned);

        // Effects before interactions: update reserves now.
        require(amount0 <= r0 && amount1 <= r1, "reserves");
        uint256 out0 = uint256(r0) - amount0;
        uint256 out1 = uint256(r1) - amount1;
        reserve0 = out0.toUint112();
        reserve1 = out1.toUint112();
        emit Sync(reserve0, reserve1);

        require(token0.transfer(msg.sender, amount0), "transfer0");
        require(token1.transfer(msg.sender, amount1), "transfer1");

        emit LiquidityRemoved(msg.sender, amount0, amount1, lpBurned);
    }

    function swapExactIn(address tokenIn, uint256 amountIn, uint256 minOut) external nonReentrant returns (uint256 amountOut) {
        require(amountIn != 0, "amount=0");
        require(tokenIn == address(token0) || tokenIn == address(token1), "tokenIn");

        (uint112 r0, uint112 r1) = (reserve0, reserve1);
        require(r0 != 0 && r1 != 0, "empty");

        bool in0 = tokenIn == address(token0);
        uint256 reserveIn = in0 ? uint256(r0) : uint256(r1);
        uint256 reserveOut = in0 ? uint256(r1) : uint256(r0);

        // No-fee x*y=k.
        amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
        require(amountOut >= minOut, "slippage");

        // Effects before interactions: update reserves now.
        uint256 newReserveIn = reserveIn + amountIn;
        require(amountOut <= reserveOut, "reserves");
        uint256 newReserveOut = reserveOut - amountOut;
        require(newReserveIn <= type(uint112).max, "overflow");
        require(newReserveOut <= type(uint112).max, "overflow");
        if (in0) {
            reserve0 = newReserveIn.toUint112();
            reserve1 = newReserveOut.toUint112();
        } else {
            reserve1 = newReserveIn.toUint112();
            reserve0 = newReserveOut.toUint112();
        }
        emit Sync(reserve0, reserve1);

        if (in0) {
            require(token0.transferFrom(msg.sender, address(this), amountIn), "transferIn");
            require(token1.transfer(msg.sender, amountOut), "transferOut");
        } else {
            require(token1.transferFrom(msg.sender, address(this), amountIn), "transferIn");
            require(token0.transfer(msg.sender, amountOut), "transferOut");
        }

        emit Swapped(msg.sender, tokenIn, amountIn, in0 ? address(token1) : address(token0), amountOut);
    }

    function _sync() internal {
        uint256 b0 = token0.balanceOf(address(this));
        uint256 b1 = token1.balanceOf(address(this));
        reserve0 = b0.toUint112();
        reserve1 = b1.toUint112();
        emit Sync(reserve0, reserve1);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        uint256 bal = lpBalance[from];
        require(bal >= amount, "balance");
        unchecked {
            lpBalance[from] = bal - amount;
        }
        lpBalance[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y == 0) return 0;
        if (y <= 3) return 1;
        z = y;
        uint256 x = (y / 2) + 1;
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        }
    }
}
