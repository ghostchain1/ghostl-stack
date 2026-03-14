/**
 * dex-generator.ts — GhostXchange DEX parametrized generator.
 *
 * Produces customized GhostXchange deployment bundles:
 *   - GhostXPair   — constant-product (x·y=k) AMM pair (LP tokens inline)
 *   - GhostXFactory — pair registry and creation
 *   - GhostXRouter  — user-facing router with slippage + deadline
 *
 * The static versions live in contracts/src/ghostx/.
 * This generator produces named variants for custom GhostXchange deployments.
 */

import {
  GHOST_SPDX_UNLICENSED,
  GHOST_PRAGMA,
  ghostContractHeader,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface DexOptions {
  /**
   * Deployment label, e.g. "MyGhostX".
   * Used to name the generated contracts: {label}Pair, {label}Factory, {label}Router.
   * Defaults to "GhostX".
   */
  label?: string;
  /**
   * Relative path prefix from generated file to contracts/src/ghostx/
   * when importing pair/factory within the same dir (default "").
   */
  importBase?: string;
}

export interface DexBundle {
  /** Solidity source for the Pair contract */
  pair: string;
  /** Solidity source for the Factory contract */
  factory: string;
  /** Solidity source for the Router contract */
  router: string;
  /** Suggested output paths */
  outputPaths: {
    pair: string;
    factory: string;
    router: string;
  };
}

/**
 * Generates all three GhostXchange DEX contracts as a bundle.
 *
 * @param opts       Generator options
 * @param outDir     Workspace-relative directory, e.g. "contracts/src/ghostx"
 */
export function generateDexBundle(opts: DexOptions = {}, outDir = "contracts/src/ghostx"): DexBundle {
  const label = opts.label ?? "GhostX";

  const pairName    = `${label}Pair`;
  const factoryName = `${label}Factory`;
  const routerName  = `${label}Router`;

  const pairPath    = `${outDir}/${pairName}.sol`;
  const factoryPath = `${outDir}/${factoryName}.sol`;
  const routerPath  = `${outDir}/${routerName}.sol`;

  return {
    pair:    generatePair(pairName, pairPath),
    factory: generateFactory(factoryName, pairName, factoryPath),
    router:  generateRouter(routerName, factoryName, pairName, routerPath),
    outputPaths: { pair: pairPath, factory: factoryPath, router: routerPath },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal generators
// ─────────────────────────────────────────────────────────────────────────────

function generatePair(name: string, outputPath: string): string {
  const doc = natspec({
    title: `${name} — GhostXchange Constant-Product Liquidity Pair`,
    notice: "Implements x·y=k AMM for two GRC-20 tokens. LP shares are issued as GRC-20 compatible tokens on this contract.",
    dev: "Reentrancy-safe. All token transfers require-wrapped. uint112 reserve casts overflow-guarded per Forge lint rules.",
  });

  const src = `${doc}
contract ${name} {
    // ── LP token (GRC-20 inline) ──────────────────────────────────────────────

    string  public constant name     = "GhostXchange LP Token";
    string  public constant symbol   = "GHOSTX-LP";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Pair state ────────────────────────────────────────────────────────────

    address public immutable FACTORY;
    address public immutable TOKEN0;
    address public immutable TOKEN1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32  private _blockTimestampLast;

    uint256 private constant MINIMUM_LIQUIDITY = 1_000;
    bool    private _locked;

    // ── Events — LP token ────────────────────────────────────────────────────

    event Transfer(address indexed from,   address indexed to,      uint256 amount);
    event Approval(address indexed owner,  address indexed spender, uint256 amount);

    // ── Events — Pair ────────────────────────────────────────────────────────

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

    // ── Errors ────────────────────────────────────────────────────────────────

    error Locked();
    error InvalidTo();
    error InsufficientInputAmount();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InsufficientLiquidityBurned();
    error InsufficientLiquidityMinted();
    error KInvariantViolated();
    error TransferFailed();

    // ── Modifier ─────────────────────────────────────────────────────────────

    modifier lock() {
        if (_locked) revert Locked();
        _locked = true;
        _;
        _locked = false;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address factory, address token0, address token1) {
        FACTORY = factory;
        TOKEN0  = token0;
        TOKEN1  = token1;
    }

    // ── LP token GRC-20 functions ─────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _lpTransfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "${name}: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _lpTransfer(from, to, amount);
        return true;
    }

    // ── View ──────────────────────────────────────────────────────────────────

    function getReserves()
        public
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
    {
        reserve0           = _reserve0;
        reserve1           = _reserve1;
        blockTimestampLast = _blockTimestampLast;
    }

    // ── Core — add liquidity ──────────────────────────────────────────────────

    /// @notice Called by the router after transferring both tokens to this pair.
    function addLiquidity(address to) external lock returns (uint256 liquidity) {
        (uint112 res0, uint112 res1,) = getReserves();
        uint256 balance0 = _tokenBalance(TOKEN0);
        uint256 balance1 = _tokenBalance(TOKEN1);
        uint256 amount0  = balance0 - res0;
        uint256 amount1  = balance1 - res1;

        uint256 supply = totalSupply;
        if (supply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _lpMint(address(1), MINIMUM_LIQUIDITY); // permanent lock
        } else {
            uint256 liq0 = (amount0 * supply) / res0;
            uint256 liq1 = (amount1 * supply) / res1;
            liquidity    = liq0 < liq1 ? liq0 : liq1;
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();

        _lpMint(to, liquidity);
        _update(balance0, balance1, res0, res1);
        emit Mint(msg.sender, amount0, amount1);
    }

    // ── Core — remove liquidity ───────────────────────────────────────────────

    /// @notice Burns LP tokens that were transferred here first; returns underlying.
    function removeLiquidity(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity = balanceOf[address(this)];
        uint256 supply    = totalSupply;
        uint256 balance0  = _tokenBalance(TOKEN0);
        uint256 balance1  = _tokenBalance(TOKEN1);
        amount0 = (liquidity * balance0) / supply;
        amount1 = (liquidity * balance1) / supply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _lpBurn(address(this), liquidity);
        _safeTransfer(TOKEN0, to, amount0);
        _safeTransfer(TOKEN1, to, amount1);
        _update(_tokenBalance(TOKEN0), _tokenBalance(TOKEN1), _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // ── Core — swap ───────────────────────────────────────────────────────────

    /// @notice Execute a swap. Router sends input tokens first, then calls swap().
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 res0, uint112 res1,) = getReserves();
        if (amount0Out >= res0 || amount1Out >= res1) revert InsufficientLiquidity();
        if (to == TOKEN0 || to == TOKEN1) revert InvalidTo();

        if (amount0Out > 0) _safeTransfer(TOKEN0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(TOKEN1, to, amount1Out);

        uint256 balance0  = _tokenBalance(TOKEN0);
        uint256 balance1  = _tokenBalance(TOKEN1);
        uint256 amount0In = balance0 > (res0 - amount0Out) ? balance0 - (res0 - amount0Out) : 0;
        uint256 amount1In = balance1 > (res1 - amount1Out) ? balance1 - (res1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        // Constant-product invariant with 0.3% fee: balance_adj0 * balance_adj1 >= res0 * res1 * 1_000_000
        uint256 b0Adj = balance0 * 1_000 - amount0In * 3;
        uint256 b1Adj = balance1 * 1_000 - amount1In * 3;
        if (b0Adj * b1Adj < uint256(res0) * uint256(res1) * 1_000_000) revert KInvariantViolated();

        _update(balance0, balance1, res0, res1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // ── Sync ──────────────────────────────────────────────────────────────────

    function sync() external lock {
        _update(_tokenBalance(TOKEN0), _tokenBalance(TOKEN1), _reserve0, _reserve1);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Updates reserves. Guards uint112 narrowing cast (Forge lint: unsafe-typecast).
    function _update(uint256 b0, uint256 b1, uint112, uint112) internal {
        require(b0 <= type(uint112).max, "${name}: balance0 overflow");
        require(b1 <= type(uint112).max, "${name}: balance1 overflow");
        _reserve0           = uint112(b0);
        _reserve1           = uint112(b1);
        _blockTimestampLast = uint32(block.timestamp);
        emit Sync(_reserve0, _reserve1);
    }

    /// @dev Reads this contract's balance for \`token\` via staticcall.
    function _tokenBalance(address token) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        require(ok && data.length >= 32, "${name}: balanceOf query failed");
        return abi.decode(data, (uint256));
    }

    /// @dev Safe transfer checking return bool. (Forge lint: erc20-unchecked-transfer)
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "${name}: transfer failed"
        );
    }

    function _lpTransfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "${name}: LP transfer to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "${name}: insufficient LP balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to]  += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _lpMint(address to, uint256 amount) internal {
        totalSupply    += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _lpBurn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "${name}: LP burn exceeds balance");
        unchecked {
            balanceOf[from] = bal - amount;
            totalSupply    -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }
}`;

  return solidityFile([
    GHOST_SPDX_UNLICENSED,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    src,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────

function generateFactory(name: string, pairName: string, outputPath: string): string {
  const doc = natspec({
    title: `${name} — GhostXchange Pair Factory`,
    notice: "Deploys and tracks all GhostXchange liquidity pairs. Any two distinct GRC-20 tokens create exactly one canonical pair.",
  });

  const src = `${doc}
contract ${name} {
    address public owner;
    address public feeRecipient;

    address[] public allPairs;
    mapping(address => mapping(address => address)) public getPair;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 totalPairs);
    event OwnerUpdated(address indexed from, address indexed to);
    event FeeRecipientUpdated(address indexed from, address indexed to);

    error IdenticalTokens();
    error ZeroAddress();
    error PairExists();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "${name}: zero fee recipient");
        owner        = msg.sender;
        feeRecipient = _feeRecipient;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalTokens();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        pair = address(new ${pairName}(address(this), token0, token1));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "${name}: zero address");
        emit OwnerUpdated(owner, to);
        owner = to;
    }

    function setFeeRecipient(address to) external onlyOwner {
        emit FeeRecipientUpdated(feeRecipient, to);
        feeRecipient = to;
    }
}`;

  return solidityFile([
    GHOST_SPDX_UNLICENSED,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    `import { ${pairName} } from "./${pairName}.sol";`,
    src,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────

function generateRouter(
  name: string,
  factoryName: string,
  pairName: string,
  outputPath: string,
): string {
  const doc = natspec({
    title: `${name} — GhostXchange User-Facing Router`,
    notice: "Routes swaps and liquidity operations with slippage protection and deadline enforcement.",
    dev: "All token.transferFrom calls are require-wrapped (Forge lint: erc20-unchecked-transfer).",
  });

  const src = `${doc}
contract ${name} {
    address public immutable FACTORY;

    event LiquidityAdded(
        address indexed pair,
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(address indexed pair, address indexed provider, uint256 amount0, uint256 amount1);
    event SwapExecuted(address indexed pair, address indexed recipient, uint256 amountIn, uint256 amountOut);

    error Expired();
    error SlippageExceeded();
    error PairNotFound();
    error InsufficientAmount();

    modifier notExpired(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    constructor(address factory) {
        require(factory != address(0), "${name}: zero factory");
        FACTORY = factory;
    }

    // ── Add liquidity ─────────────────────────────────────────────────────────

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
        address pair = ${factoryName}(FACTORY).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = ${factoryName}(FACTORY).createPair(tokenA, tokenB);
        }

        (amountA, amountB) = _computeAmounts(pair, tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);

        bool ok0 = _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        require(ok0, "${name}: tokenA transferFrom failed");
        bool ok1 = _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        require(ok1, "${name}: tokenB transferFrom failed");

        liquidity = ${pairName}(pair).addLiquidity(to);
        emit LiquidityAdded(pair, to, amountA, amountB, liquidity);
    }

    // ── Remove liquidity ──────────────────────────────────────────────────────

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = ${factoryName}(FACTORY).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound();

        bool ok = _safeTransferFrom(pair, msg.sender, pair, liquidity);
        require(ok, "${name}: LP transferFrom failed");

        (uint256 out0, uint256 out1) = ${pairName}(pair).removeLiquidity(to);

        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (out0, out1) : (out1, out0);
        if (amountA < amountAMin || amountB < amountBMin) revert SlippageExceeded();

        emit LiquidityRemoved(pair, msg.sender, amountA, amountB);
    }

    // ── Swap exact in ─────────────────────────────────────────────────────────

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountOut) {
        address pair = ${factoryName}(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();

        bool ok = _safeTransferFrom(tokenIn, msg.sender, pair, amountIn);
        require(ok, "${name}: transferFrom failed");

        (uint112 res0, uint112 res1,) = ${pairName}(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));

        amountOut = _getAmountOut(amountIn, resIn, resOut);
        if (amountOut < amountOutMin) revert SlippageExceeded();

        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));

        ${pairName}(pair).swap(amount0Out, amount1Out, to);
        emit SwapExecuted(pair, to, amountIn, amountOut);
    }

    // ── Swap exact out ────────────────────────────────────────────────────────

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external notExpired(deadline) returns (uint256 amountIn) {
        address pair = ${factoryName}(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();

        (uint112 res0, uint112 res1,) = ${pairName}(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));

        amountIn = _getAmountIn(amountOut, resIn, resOut);
        if (amountIn > amountInMax) revert SlippageExceeded();

        bool ok = _safeTransferFrom(tokenIn, msg.sender, pair, amountIn);
        require(ok, "${name}: transferFrom failed");

        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));

        ${pairName}(pair).swap(amount0Out, amount1Out, to);
        emit SwapExecuted(pair, to, amountIn, amountOut);
    }

    // ── Quote views ───────────────────────────────────────────────────────────

    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut)
        external view returns (uint256)
    {
        address pair = ${factoryName}(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();
        (uint112 res0, uint112 res1,) = ${pairName}(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));
        return _getAmountOut(amountIn, resIn, resOut);
    }

    function getAmountIn(uint256 amountOut, address tokenIn, address tokenOut)
        external view returns (uint256)
    {
        address pair = ${factoryName}(FACTORY).getPair(tokenIn, tokenOut);
        if (pair == address(0)) revert PairNotFound();
        (uint112 res0, uint112 res1,) = ${pairName}(pair).getReserves();
        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 resIn, uint256 resOut) = tokenIn == token0
            ? (uint256(res0), uint256(res1))
            : (uint256(res1), uint256(res0));
        return _getAmountIn(amountOut, resIn, resOut);
    }

    // ── Internal AMM math ─────────────────────────────────────────────────────

    /// @dev 0.3% fee: amountOut = (amountIn * 997 * resOut) / (resIn * 1000 + amountIn * 997)
    function _getAmountOut(uint256 amountIn, uint256 resIn, uint256 resOut)
        internal pure returns (uint256)
    {
        if (amountIn == 0 || resIn == 0 || resOut == 0) revert InsufficientAmount();
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * resOut) / (resIn * 1_000 + amountInWithFee);
    }

    /// @dev 0.3% fee: amountIn = ceil((resIn * amountOut * 1000) / ((resOut - amountOut) * 997))
    function _getAmountIn(uint256 amountOut, uint256 resIn, uint256 resOut)
        internal pure returns (uint256)
    {
        if (amountOut == 0 || resIn == 0 || resOut == 0 || amountOut >= resOut) {
            revert InsufficientAmount();
        }
        return ((resIn * amountOut * 1_000) / ((resOut - amountOut) * 997)) + 1;
    }

    function _sortTokens(address tokenA, address tokenB)
        internal pure returns (address token0, address token1)
    {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function _computeAmounts(
        address pair,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint112 res0, uint112 res1,) = ${pairName}(pair).getReserves();
        if (res0 == 0 && res1 == 0) {
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

    /// @dev Safe transferFrom — checks return value. (Forge lint: erc20-unchecked-transfer)
    function _safeTransferFrom(address token, address from, address to, uint256 amount)
        internal returns (bool)
    {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}`;

  return solidityFile([
    GHOST_SPDX_UNLICENSED,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    `import { ${factoryName} } from "./${factoryName}.sol";`,
    `import { ${pairName} }    from "./${pairName}.sol";`,
    src,
  ]);
}
