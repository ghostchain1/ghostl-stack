// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../governance/PolicyRegistry.sol";
import "./IDexAdapter.sol";

interface IERC20DexAdapterToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice TWAP quote oracle interface expected by the canonical GhostChain DEX adapter.
/// @dev Production should implement this oracle against the canonical DEX and configure update cadence.
interface ITwapQuoteOracle {
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}

/// @notice UniswapV2-like router interface (swap + add liquidity).
interface IRouterLike {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

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
}

/// @notice Canonical GhostChain DEX adapter with TWAP-based slippage enforcement.
/// @dev This adapter is intended for production once wired to the canonical DEX router and a TWAP oracle.
///      The repo also ships `MinimalAmmDexAdapter` for dev-only integration tests.
contract GhostDexAdapter is Governed, IDexAdapter {
    uint16 public constant BPS_DENOM = 10_000;

    PolicyRegistry public policyRegistry;
    address public dexRouter;
    address public twapOracle;
    address public authorizedCaller;

    uint64 public deadlineSeconds = 300; // 5 minutes

    event DexRouterSet(address indexed router);
    event TwapOracleSet(address indexed oracle);
    event PolicyRegistrySet(address indexed policyRegistry);
    event AuthorizedCallerSet(address indexed caller);
    event DeadlineSecondsSet(uint64 deadlineSeconds);

    error UnauthorizedCaller(address caller);

    constructor(
        address governor_,
        address timelock_,
        PolicyRegistry policyRegistry_,
        address dexRouter_,
        address twapOracle_,
        address authorizedCaller_
    ) Governed(governor_, timelock_) {
        require(dexRouter_ != address(0), "router=0");
        require(twapOracle_ != address(0), "oracle=0");
        require(address(dexRouter_).code.length != 0, "router not contract");
        require(address(twapOracle_).code.length != 0, "oracle not contract");
        policyRegistry = policyRegistry_;
        dexRouter = dexRouter_;
        twapOracle = twapOracle_;
        authorizedCaller = authorizedCaller_;
    }

    modifier onlyAuthorized() {
        address caller = authorizedCaller;
        if (caller != address(0) && msg.sender != caller) revert UnauthorizedCaller(msg.sender);
        _;
    }

    function setDexRouter(address router) external onlyGovernance {
        require(router != address(0), "router=0");
        require(router.code.length != 0, "router not contract");
        dexRouter = router;
        emit DexRouterSet(router);
    }

    function setTwapOracle(address oracle) external onlyGovernance {
        require(oracle != address(0), "oracle=0");
        require(oracle.code.length != 0, "oracle not contract");
        twapOracle = oracle;
        emit TwapOracleSet(oracle);
    }

    function setPolicyRegistry(PolicyRegistry registry) external onlyGovernance {
        policyRegistry = registry;
        emit PolicyRegistrySet(address(registry));
    }

    function setAuthorizedCaller(address caller) external onlyGovernance {
        authorizedCaller = caller;
        emit AuthorizedCallerSet(caller);
    }

    function setDeadlineSeconds(uint64 deadlineSeconds_) external onlyGovernance {
        require(deadlineSeconds_ != 0, "deadline=0");
        deadlineSeconds = deadlineSeconds_;
        emit DeadlineSecondsSet(deadlineSeconds_);
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint16 maxSlippageBps, address recipient)
        external
        onlyAuthorized
        returns (uint256 amountOut)
    {
        require(recipient != address(0), "recipient=0");
        require(tokenIn != address(0) && tokenOut != address(0), "token=0");
        require(tokenIn != tokenOut, "same token");
        require(amountIn != 0, "amountIn=0");
        require(maxSlippageBps <= BPS_DENOM, "slippage");

        uint16 cap = _policyMaxSlippageBps();
        require(maxSlippageBps <= cap, "policy slippage");

        uint256 expectedOut = ITwapQuoteOracle(twapOracle).quote(tokenIn, tokenOut, amountIn);
        require(expectedOut != 0, "quote=0");
        uint256 minOut = (expectedOut * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;

        require(IERC20DexAdapterToken(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pullIn");
        _approve(tokenIn, dexRouter, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = IRouterLike(dexRouter).swapExactTokensForTokens(
            amountIn,
            minOut,
            path,
            recipient,
            block.timestamp + uint256(deadlineSeconds)
        );
        amountOut = amounts[amounts.length - 1];
    }

    function provideLiquidityOneSided(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 maxSlippageBps,
        address recipient
    ) external onlyAuthorized returns (uint256 lpMinted) {
        require(recipient != address(0), "recipient=0");
        require(tokenIn != address(0) && tokenOut != address(0), "token=0");
        require(tokenIn != tokenOut, "same token");
        require(amountIn != 0, "amountIn=0");
        require(maxSlippageBps <= BPS_DENOM, "slippage");

        uint16 cap = _policyMaxSlippageBps();
        require(maxSlippageBps <= cap, "policy slippage");

        require(IERC20DexAdapterToken(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pullIn");

        uint256 amountSwap = amountIn / 2;
        require(amountSwap != 0, "amountIn too small");
        uint256 amountRemain = amountIn - amountSwap;

        // Swap half into tokenOut and keep proceeds in this adapter for liquidity add.
        uint256 expectedOut = ITwapQuoteOracle(twapOracle).quote(tokenIn, tokenOut, amountSwap);
        require(expectedOut != 0, "quote=0");
        uint256 minOut = (expectedOut * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;

        _approve(tokenIn, dexRouter, amountSwap);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = IRouterLike(dexRouter).swapExactTokensForTokens(
            amountSwap,
            minOut,
            path,
            address(this),
            block.timestamp + uint256(deadlineSeconds)
        );
        uint256 amountOut = amounts[amounts.length - 1];

        // Add liquidity (tokenIn + tokenOut) to recipient.
        _approve(tokenIn, dexRouter, amountRemain);
        _approve(tokenOut, dexRouter, amountOut);

        uint256 minIn = (amountRemain * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;
        uint256 minOut2 = (amountOut * (BPS_DENOM - maxSlippageBps)) / BPS_DENOM;

        (uint256 usedIn, uint256 usedOut, uint256 liquidity) = IRouterLike(dexRouter).addLiquidity(
            tokenIn,
            tokenOut,
            amountRemain,
            amountOut,
            minIn,
            minOut2,
            recipient,
            block.timestamp + uint256(deadlineSeconds)
        );

        // Refund any leftovers to the recipient.
        if (amountRemain > usedIn) {
            require(IERC20DexAdapterToken(tokenIn).transfer(recipient, amountRemain - usedIn), "refundIn");
        }
        if (amountOut > usedOut) {
            require(IERC20DexAdapterToken(tokenOut).transfer(recipient, amountOut - usedOut), "refundOut");
        }

        lpMinted = liquidity;
    }

    function _approve(address token, address spender, uint256 amount) internal {
        require(IERC20DexAdapterToken(token).approve(spender, 0), "approve0");
        require(IERC20DexAdapterToken(token).approve(spender, amount), "approve");
    }

    function _policyMaxSlippageBps() internal view returns (uint16) {
        PolicyRegistry registry = policyRegistry;
        if (address(registry) == address(0)) return BPS_DENOM;
        bytes32 key = keccak256(abi.encode("ghost.lge.dex.maxSlippageBps"));
        (, , , , , , bool enabled) = registry.policySettings(key);
        if (!enabled) return BPS_DENOM;
        (uint256 value, , , , ) = registry.effectivePolicy(key);
        if (value > BPS_DENOM) return BPS_DENOM;
        return uint16(value);
    }
}

