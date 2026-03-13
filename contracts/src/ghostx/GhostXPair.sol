// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// GhostChain Contracts v5.6.1 (contracts/src/ghostx/GhostXPair.sol)

/**
 * @title GhostXPair — GhostXchange Constant-Product Liquidity Pair
 * @notice Implements x·y=k AMM for two GRC-20 tokens.
 *         LP shares are issued as GRC-20 compatible tokens on this contract.
 *         Fee: 0.3% on each swap, distributed pro-rata to liquidity providers.
 * @dev Reentrancy-safe via _locked guard.
 *      All ERC/GRC-20 transfer calls are require-wrapped (Forge lint: erc20-unchecked-transfer).
 *      uint112 reserve narrowing casts are preceded by overflow guards (Forge lint: unsafe-typecast).
 */
contract GhostXPair {
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
        require(allowed >= amount, "GhostXPair: insufficient allowance");
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

    /// @notice Called by the router after transferring both tokens into this pair.
    ///         Mints LP tokens proportional to the deposited amounts.
    function addLiquidity(address to) external lock returns (uint256 liquidity) {
        (uint112 res0, uint112 res1,) = getReserves();
        uint256 balance0 = _tokenBalance(TOKEN0);
        uint256 balance1 = _tokenBalance(TOKEN1);
        uint256 amount0  = balance0 - res0;
        uint256 amount1  = balance1 - res1;

        uint256 supply = totalSupply;
        if (supply == 0) {
            // Initial liquidity: lock MINIMUM_LIQUIDITY to address(1) to prevent zero supply attacks.
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _lpMint(address(1), MINIMUM_LIQUIDITY);
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

    /// @notice LP tokens must be transferred here first; this burns them and
    ///         returns the proportional share of both underlying tokens.
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

    /// @notice Execute a swap. The router must send input tokens before calling this.
    /// @param amount0Out  Amount of TOKEN0 to send out (0 if not needed).
    /// @param amount1Out  Amount of TOKEN1 to send out (0 if not needed).
    /// @param to          Recipient of the output tokens.
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

        // Constant-product check with 0.3% fee (×1000 integer arithmetic).
        // Invariant: balance_adj0 * balance_adj1 >= reserve0 * reserve1 * 1_000_000
        uint256 b0Adj = balance0 * 1_000 - amount0In * 3;
        uint256 b1Adj = balance1 * 1_000 - amount1In * 3;
        if (b0Adj * b1Adj < uint256(res0) * uint256(res1) * 1_000_000) revert KInvariantViolated();

        _update(balance0, balance1, res0, res1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // ── Sync ──────────────────────────────────────────────────────────────────

    /// @notice Forces reserves to match the actual on-chain token balances.
    function sync() external lock {
        _update(_tokenBalance(TOKEN0), _tokenBalance(TOKEN1), _reserve0, _reserve1);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Updates reserves from the new balances.
    ///      Overflow guards on uint112 casts satisfy Forge lint: unsafe-typecast.
    function _update(uint256 b0, uint256 b1, uint112 /*res0*/, uint112 /*res1*/) internal {
        require(b0 <= type(uint112).max, "GhostXPair: balance0 overflow");
        require(b1 <= type(uint112).max, "GhostXPair: balance1 overflow");
        _reserve0           = uint112(b0);
        _reserve1           = uint112(b1);
        _blockTimestampLast = uint32(block.timestamp);
        emit Sync(_reserve0, _reserve1);
    }

    /// @dev Reads this contract's token balance via staticcall (no state change).
    function _tokenBalance(address token) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        require(ok && data.length >= 32, "GhostXPair: balanceOf query failed");
        return abi.decode(data, (uint256));
    }

    /// @dev Safe transfer — checks the GRC-20 boolean return.
    ///      Satisfies Forge lint: erc20-unchecked-transfer.
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "GhostXPair: transfer failed"
        );
    }

    function _lpTransfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "GhostXPair: LP transfer to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "GhostXPair: insufficient LP balance");
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
        require(bal >= amount, "GhostXPair: LP burn exceeds balance");
        unchecked {
            balanceOf[from] = bal - amount;
            totalSupply    -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    /// @dev Integer square root (Babylonian method).
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
