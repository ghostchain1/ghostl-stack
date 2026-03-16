// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghostswap/GhostPair.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";
import { IGST20, IGhostFactory } from "./IGhostSwap.sol";

/// @title GhostPair
/// @notice Constant-product AMM liquidity pair for the GhostXchange DEX.
///         Based on the battle-tested Uniswap V2 pair design, rebranded for GhostChain.
///
///         Key mechanics:
///           invariant:  reserve0 * reserve1 ≥ k  (after fees)
///           swap fee:   0.3% (30 bps), 1/6 of fee goes to protocol feeTo if set
///           LP tokens:  minted on addLiquidity, burned on removeLiquidity
///
/// @dev Deployed only by GhostFactory via CREATE2.
///      Callers (Router) must transfer tokens INTO this contract before calling
///      mint/burn/swap — identical to Uniswap V2 pull pattern.
contract GhostPair is GhostBrand, ReentrancyGuard {
    // ─────────────────────── LP token metadata ───────────────────────────────

    string public constant name     = "GhostSwap LP";
    string public constant symbol   = "GLP";
    uint8  public constant decimals = 18;

    // ─────────────────────── LP token storage ────────────────────────────────

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─────────────────────── Pair storage ────────────────────────────────────

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    address public factory;
    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32  private _blockTimestampLast;

    // Cumulative price accumulators (for TWAP — UQ112x112 format).
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    // Tracks reserve0 * reserve1 at last liquidity event (for protocol fee).
    uint256 public kLast;

    // ─────────────────────── Events ──────────────────────────────────────────

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);

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

    // ─────────────────────── Init (called by Factory) ────────────────────────

    constructor() {
        factory = msg.sender;
    }

    /// @notice Called once by GhostFactory immediately after CREATE2.
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "GhostPair: forbidden");
        token0 = _token0;
        token1 = _token1;
    }

    // ─────────────────────── ERC-20 LP surface ───────────────────────────────

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transferLP(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "GhostPair: allowance");
            allowance[from][msg.sender] = a - value;
        }
        _transferLP(from, to, value);
        return true;
    }

    function _transferLP(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "GhostPair: lp balance");
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
    }

    function _mintLP(address to, uint256 value) internal {
        totalSupply       += value;
        balanceOf[to]     += value;
        emit Transfer(address(0), to, value);
    }

    function _burnLP(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "GhostPair: lp balance");
        balanceOf[from] -= value;
        totalSupply     -= value;
        emit Transfer(from, address(0), value);
    }

    // ─────────────────────── Reserve view ────────────────────────────────────

    /// @notice Returns current reserves and the last block timestamp they were updated.
    function getReserves()
        public
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
    {
        reserve0           = _reserve0;
        reserve1           = _reserve1;
        blockTimestampLast = _blockTimestampLast;
    }

    // ─────────────────────── Internal helpers ────────────────────────────────

    /// @dev Update reserves, accumulate TWAP, and emit Sync.
    function _update(uint256 balance0, uint256 balance1, uint112 reserve0_, uint112 reserve1_) internal {
        require(balance0 <= type(uint112).max, "GhostPair: overflow0");
        require(balance1 <= type(uint112).max, "GhostPair: overflow1");

        // unsafe-typecast guard — bounds checked above.
        require(balance0 <= type(uint112).max, "overflow");
        require(balance1 <= type(uint112).max, "overflow");
        uint112 b0 = uint112(balance0);
        uint112 b1 = uint112(balance1);

        uint32 blockTimestamp;
        // block.timestamp fits in uint32 until year 2106 — acceptable.
        unchecked {
            blockTimestamp = uint32(block.timestamp);
        }
        uint32 timeElapsed;
        unchecked {
            timeElapsed = blockTimestamp - _blockTimestampLast;
        }

        if (timeElapsed > 0 && reserve0_ != 0 && reserve1_ != 0) {
            // UQ112x112 price accumulators (overflow intended per V2 design).
            unchecked {
                price0CumulativeLast += (uint256(reserve1_) << 112) / uint256(reserve0_) * timeElapsed;
                price1CumulativeLast += (uint256(reserve0_) << 112) / uint256(reserve1_) * timeElapsed;
            }
        }

        _reserve0              = b0;
        _reserve1              = b1;
        _blockTimestampLast    = blockTimestamp;
        emit Sync(b0, b1);
    }

    /// @dev Mint protocol fee LP tokens to feeTo address.
    ///      Fee = 1/6 of accumulated growth in sqrt(k).
    function _mintFee(uint112 reserve0_, uint112 reserve1_) internal returns (bool feeOn) {
        address feeTo = IGhostFactory(factory).feeTo();
        feeOn = (feeTo != address(0));

        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK     = _sqrt(uint256(reserve0_) * uint256(reserve1_));
                uint256 rootKLast = _sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator   = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity   = numerator / denominator;
                    if (liquidity > 0) {
                        _mintLP(feeTo, liquidity);
                    }
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    // ─────────────────────── AMM core operations ─────────────────────────────

    /// @notice Add liquidity — caller must have pre-transferred token0 and token1.
    ///         Returns LP tokens minted.  First mint burns MINIMUM_LIQUIDITY to address(0xdead).
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 reserve0_, uint112 reserve1_,) = getReserves();

        uint256 balance0 = IGST20(token0).balanceOf(address(this));
        uint256 balance1 = IGST20(token1).balanceOf(address(this));
        uint256 amount0  = balance0 - reserve0_;
        uint256 amount1  = balance1 - reserve1_;

        bool feeOn        = _mintFee(reserve0_, reserve1_);
        uint256 _totalLP  = totalSupply;

        if (_totalLP == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mintLP(address(0xdead), MINIMUM_LIQUIDITY); // permanent lock
        } else {
            uint256 l0 = amount0 * _totalLP / reserve0_;
            uint256 l1 = amount1 * _totalLP / reserve1_;
            liquidity = l0 < l1 ? l0 : l1;
        }

        require(liquidity > 0, "GhostPair: insufficient liquidity minted");
        _mintLP(to, liquidity);

        _update(balance0, balance1, reserve0_, reserve1_);
        if (feeOn) kLast = uint256(_reserve0) * uint256(_reserve1);

        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Remove liquidity — caller must have pre-transferred LP tokens to pair.
    ///         Returns token0 and token1 amounts sent to `to`.
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        (uint112 reserve0_, uint112 reserve1_,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;

        uint256 balance0  = IGST20(_token0).balanceOf(address(this));
        uint256 balance1  = IGST20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn   = _mintFee(reserve0_, reserve1_);
        uint256 _sup = totalSupply;

        amount0 = liquidity * balance0 / _sup;
        amount1 = liquidity * balance1 / _sup;

        require(amount0 > 0 && amount1 > 0, "GhostPair: insufficient liquidity burned");

        _burnLP(address(this), liquidity);

        // erc20-unchecked-transfer lint: require return values.
        require(IGST20(_token0).transfer(to, amount0), "GhostPair: transfer0 failed");
        require(IGST20(_token1).transfer(to, amount1), "GhostPair: transfer1 failed");

        balance0 = IGST20(_token0).balanceOf(address(this));
        balance1 = IGST20(_token1).balanceOf(address(this));

        _update(balance0, balance1, reserve0_, reserve1_);
        if (feeOn) kLast = uint256(_reserve0) * uint256(_reserve1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Execute a swap.  Exactly one of amount0Out / amount1Out must be > 0.
    ///         Caller must have pre-transferred the input tokens to this contract.
    /// @param amount0Out  Amount of token0 to send out.
    /// @param amount1Out  Amount of token1 to send out.
    /// @param to          Recipient of output tokens.
    /// @param data        If non-empty, calls to.ghostSwapCall(msg.sender, amount0Out, amount1Out, data)
    ///                    (flash swap — input must be repaid within the call).
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data)
        external
        nonReentrant
    {
        require(amount0Out > 0 || amount1Out > 0, "GhostPair: zero output");

        (uint112 reserve0_, uint112 reserve1_,) = getReserves();
        require(amount0Out < reserve0_, "GhostPair: insufficient reserve0");
        require(amount1Out < reserve1_, "GhostPair: insufficient reserve1");

        address _token0 = token0;
        address _token1 = token1;
        require(to != _token0 && to != _token1, "GhostPair: invalid to");

        // Optimistic transfer of output.
        if (amount0Out > 0) {
            require(IGST20(_token0).transfer(to, amount0Out), "GhostPair: out0 failed");
        }
        if (amount1Out > 0) {
            require(IGST20(_token1).transfer(to, amount1Out), "GhostPair: out1 failed");
        }

        // Flash-swap callback.
        if (data.length > 0) {
            IGhostSwapCallee(to).ghostSwapCall(msg.sender, amount0Out, amount1Out, data);
        }

        uint256 balance0 = IGST20(_token0).balanceOf(address(this));
        uint256 balance1 = IGST20(_token1).balanceOf(address(this));

        // Derive amounts in.
        uint256 amount0In = balance0 > reserve0_ - amount0Out ? balance0 - (reserve0_ - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1_ - amount1Out ? balance1 - (reserve1_ - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "GhostPair: insufficient input");

        // Verify constant-product invariant (with 0.3% fee).
        // adjusted = balance * 1000 - amountIn * 3
        uint256 adjusted0 = balance0 * 1_000 - amount0In * 3;
        uint256 adjusted1 = balance1 * 1_000 - amount1In * 3;
        require(
            adjusted0 * adjusted1 >= uint256(reserve0_) * uint256(reserve1_) * 1_000_000,
            "GhostPair: K invariant"
        );

        _update(balance0, balance1, reserve0_, reserve1_);

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Force reserves to match current token balances (in case of donation).
    function sync() external nonReentrant {
        _update(
            IGST20(token0).balanceOf(address(this)),
            IGST20(token1).balanceOf(address(this)),
            _reserve0,
            _reserve1
        );
    }

    // ─────────────────────── Math helpers ────────────────────────────────────

    /// @dev Integer square root (Babylonian method).
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

/// @notice Flash-swap callee interface (optional — pair calls this when data.length > 0).
interface IGhostSwapCallee {
    function ghostSwapCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}
