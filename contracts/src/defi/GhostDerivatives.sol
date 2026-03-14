// GhostChain Contracts v5.6.1 (defi/GhostDerivatives.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

// ─── File-level interfaces ────────────────────────────────────────────────────

/// @dev GST20 surface used for margin transfers.
interface IGST20Deriv {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Price oracle — returns GST price in USD with 1e8 precision.
interface IGhostOracleDeriv {
    function latestAnswer() external view returns (uint256 price, uint256 updatedAt);
}

// ─────────────────────────────────────────────────────────────────────────────

/// @title  GhostDerivatives
/// @notice GST perpetual-futures exchange on GhostChain.
///
///         Traders post GST margin, choose leverage (1x–25x), and open long
///         or short positions sized in GST.  PnL is settled in GST.
///
///         A per-second funding rate rebalances open interest between longs and
///         shorts.  Positions whose margin ratio falls below the maintenance
///         threshold (5 %) can be liquidated by any caller who earns a 2.5 %
///         liquidation reward drawn from the position's margin.
///
///         An insurance fund covers bad-debt scenarios where the liquidated
///         margin is insufficient.  Protocol fees flow to the GhostChain
///         treasury.
///
///         The oracle must be a GhostBrain-verified feed — no external oracles.
contract GhostDerivatives is GhostBrand, ReentrancyGuard {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS                    = 10_000;
    uint256 public constant MAX_LEVERAGE           = 25;          // 25×
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500;        // 5 % maintenance margin
    uint256 public constant LIQUIDATION_FEE_BPS    = 250;        // 2.5 % to liquidator
    uint256 public constant PROTOCOL_FEE_BPS       = 10;         // 0.1 % per open/close
    uint256 public constant FUNDING_PERIOD         = 8 hours;    // funding payment interval
    uint256 public constant MAX_FUNDING_RATE_BPS   = 100;        // max ±1 % per period
    uint256 public constant ORACLE_MAX_AGE         = 30 minutes; // staleness threshold
    uint256 public constant PRICE_PRECISION        = 1e8;        // oracle price precision

    // ─── Immutables ───────────────────────────────────────────────────────────

    address public immutable GST_TOKEN;
    address public immutable TREASURY;

    // ─── Mutable state ────────────────────────────────────────────────────────

    address public governance;
    address public oracle;
    bool    public paused;

    // Open interest tracking
    uint256 public totalLongSize;   // Σ long position sizes (in GST)
    uint256 public totalShortSize;  // Σ short position sizes (in GST)

    // Funding
    uint256 public lastFundingTime;
    int256  public cumulativeFundingRate; // 1e18-scaled signed rate per funding period
    // Positive: longs pay shorts. Negative: shorts pay longs.

    // Insurance fund
    uint256 public insuranceFund;

    // Positions
    uint256 private _nextPositionId;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private _traderPositions;

    struct Position {
        address owner;
        bool    isLong;
        uint256 size;         // notional position size in GST
        uint256 margin;       // posted margin in GST
        uint256 entryPrice;   // GST/USD (PRICE_PRECISION) at open
        int256  fundingIndex; // cumulative funding index snapshot at open
        bool    open;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event PositionOpened(
        uint256 indexed posId,
        address indexed trader,
        bool    isLong,
        uint256 size,
        uint256 margin,
        uint256 leverage,
        uint256 entryPrice
    );
    event PositionClosed(
        uint256 indexed posId,
        address indexed trader,
        uint256 exitPrice,
        int256  pnl,
        uint256 marginReturned
    );
    event PositionLiquidated(
        uint256 indexed posId,
        address indexed liquidator,
        uint256 exitPrice,
        int256  pnl,
        uint256 liquidatorFee
    );
    event FundingSettled(uint256 timestamp, int256 newCumulativeRate, int256 periodRate);
    event InsuranceFunded(uint256 amount);
    event InsuranceUsed(uint256 amount, uint256 badDebt);
    event PausedSet(bool state);
    event OracleUpdated(address indexed prev, address indexed next);
    event GovernanceTransferred(address indexed prev, address indexed next);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error MarketPaused();
    error ZeroAmount();
    error LeverageTooHigh();
    error LeverageZero();
    error NotPositionOwner();
    error PositionClosed_();
    error PositionIsHealthy();
    error OracleStale();
    error NotGovernance();
    error InsufficientMargin();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _whenNotPaused() internal view {
        if (paused) revert MarketPaused();
    }

    function _onlyGovernance() internal view {
        if (msg.sender != governance) revert NotGovernance();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address gstToken, address treasury, address gov, address oracleAddr) {
        GST_TOKEN        = gstToken;
        TREASURY         = treasury;
        governance       = gov;
        oracle           = oracleAddr;
        lastFundingTime  = block.timestamp;
    }

    // ─── Core: Open Position ─────────────────────────────────────────────────

    /// @notice Open a long (`isLong=true`) or short position.
    /// @param  isLong    Direction of the position.
    /// @param  margin    GST margin to post (must be > 0).
    /// @param  leverage  Leverage multiplier (1–25×).
    function openPosition(bool isLong, uint256 margin, uint256 leverage)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 posId)
    {
        if (margin == 0)             revert ZeroAmount();
        if (leverage == 0)           revert LeverageZero();
        if (leverage > MAX_LEVERAGE) revert LeverageTooHigh();

        _settleFunding();

        require(
            IGST20Deriv(GST_TOKEN).transferFrom(msg.sender, address(this), margin),
            "GST: transferFrom failed"
        );

        // Protocol open fee.
        uint256 fee = (margin * leverage * PROTOCOL_FEE_BPS) / BPS;
        if (fee > 0) {
            require(fee < margin, "GhostDerivatives: fee exceeds margin");
            require(IGST20Deriv(GST_TOKEN).transfer(TREASURY, fee), "GST: transfer failed");
            margin -= fee;
        }

        uint256 size       = margin * leverage;
        uint256 entryPrice = _currentPrice();

        posId = _nextPositionId++;
        positions[posId] = Position({
            owner:        msg.sender,
            isLong:       isLong,
            size:         size,
            margin:       margin,
            entryPrice:   entryPrice,
            fundingIndex: cumulativeFundingRate,
            open:         true
        });
        _traderPositions[msg.sender].push(posId);

        if (isLong) {
            totalLongSize  += size;
        } else {
            totalShortSize += size;
        }

        emit PositionOpened(posId, msg.sender, isLong, size, margin, leverage, entryPrice);
    }

    // ─── Core: Close Position ────────────────────────────────────────────────

    /// @notice Close your own position and receive margin ± PnL.
    function closePosition(uint256 posId) external nonReentrant whenNotPaused {
        Position storage pos = positions[posId];
        if (pos.owner != msg.sender) revert NotPositionOwner();
        if (!pos.open)               revert PositionClosed_();

        _settleFunding();

        uint256 exitPrice = _currentPrice();
        (int256 pnl, uint256 fundingPayment) = _computePnL(pos, exitPrice);

        pos.open = false;

        if (pos.isLong) {
            totalLongSize  -= pos.size < totalLongSize ? pos.size : totalLongSize;
        } else {
            totalShortSize -= pos.size < totalShortSize ? pos.size : totalShortSize;
        }

        // Protocol fee on close.
        uint256 fee = (pos.size * PROTOCOL_FEE_BPS) / BPS;

        int256 net = _toInt256(pos.margin) + pnl - _toInt256(fundingPayment) - _toInt256(fee);

        uint256 payout;
        if (net > 0) {
            payout = _toUint256(net);
        } else {
            // Loss exceeds margin — use insurance fund.
            uint256 deficit = _negToUint256(net);
            if (deficit <= insuranceFund) {
                insuranceFund -= deficit;
                emit InsuranceUsed(deficit, 0);
            } else {
                emit InsuranceUsed(insuranceFund, deficit - insuranceFund);
                insuranceFund = 0;
            }
            payout = 0;
        }

        if (fee > 0) {
            require(IGST20Deriv(GST_TOKEN).transfer(TREASURY, fee), "GST: transfer failed");
        }
        if (payout > 0) {
            require(IGST20Deriv(GST_TOKEN).transfer(msg.sender, payout), "GST: transfer failed");
        }

        emit PositionClosed(posId, msg.sender, exitPrice, pnl, payout);
    }

    // ─── Core: Liquidate ─────────────────────────────────────────────────────

    /// @notice Liquidate a position whose margin ratio is below the maintenance threshold.
    function liquidatePosition(uint256 posId) external nonReentrant whenNotPaused {
        Position storage pos = positions[posId];
        if (!pos.open) revert PositionClosed_();

        _settleFunding();

        uint256 exitPrice = _currentPrice();
        (int256 pnl, uint256 fundingPayment) = _computePnL(pos, exitPrice);

        // Effective margin after unrealized PnL and funding.
        int256 effectiveMargin = _toInt256(pos.margin) + pnl - _toInt256(fundingPayment);

        // Maintenance margin = size * MAINTENANCE_MARGIN_BPS / BPS
        int256 maintenanceMargin = _toInt256((pos.size * MAINTENANCE_MARGIN_BPS) / BPS);
        if (effectiveMargin >= maintenanceMargin) revert PositionIsHealthy();

        pos.open = false;

        if (pos.isLong) {
            totalLongSize  -= pos.size < totalLongSize ? pos.size : totalLongSize;
        } else {
            totalShortSize -= pos.size < totalShortSize ? pos.size : totalShortSize;
        }

        // Liquidator fee.
        uint256 liqFee = (pos.size * LIQUIDATION_FEE_BPS) / BPS;
        uint256 remaining;
        if (effectiveMargin > 0) {
            remaining = _toUint256(effectiveMargin);
        } else {
            // Bad debt — draw from insurance fund.
            uint256 badDebt = _negToUint256(effectiveMargin);
            if (badDebt <= insuranceFund) {
                insuranceFund -= badDebt;
                emit InsuranceUsed(badDebt, 0);
            } else {
                emit InsuranceUsed(insuranceFund, badDebt - insuranceFund);
                insuranceFund = 0;
                liqFee = 0; // can't pay liquidator if insolvent
            }
            remaining = 0;
        }

        uint256 liqPay = liqFee < remaining ? liqFee : remaining;
        uint256 toProt = remaining - liqPay;

        if (liqPay > 0) {
            require(IGST20Deriv(GST_TOKEN).transfer(msg.sender, liqPay), "GST: transfer failed");
        }
        if (toProt > 0) {
            require(IGST20Deriv(GST_TOKEN).transfer(TREASURY, toProt), "GST: transfer failed");
        }

        emit PositionLiquidated(posId, msg.sender, exitPrice, pnl, liqPay);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function setPaused(bool state) external onlyGovernance {
        paused = state;
        emit PausedSet(state);
    }

    function setOracle(address next) external onlyGovernance {
        require(next != address(0), "GhostDerivatives: zero oracle");
        emit OracleUpdated(oracle, next);
        oracle = next;
    }

    function transferGovernance(address next) external onlyGovernance {
        require(next != address(0), "GhostDerivatives: zero gov");
        emit GovernanceTransferred(governance, next);
        governance = next;
    }

    /// @notice Seed the insurance fund.
    function fundInsurance(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        require(
            IGST20Deriv(GST_TOKEN).transferFrom(msg.sender, address(this), amount),
            "GST: transferFrom failed"
        );
        insuranceFund += amount;
        emit InsuranceFunded(amount);
    }

    // ─── Internal: Funding ────────────────────────────────────────────────────

    /// @dev Accrue funding rate since `lastFundingTime`.
    function _settleFunding() internal {
        uint256 elapsed = block.timestamp - lastFundingTime;
        if (elapsed < FUNDING_PERIOD) return;

        // Funding rate proportional to OI imbalance.
        int256 periodRate = _fundingRate();
        cumulativeFundingRate += periodRate;
        lastFundingTime        = block.timestamp;

        emit FundingSettled(block.timestamp, cumulativeFundingRate, periodRate);
    }

    /// @dev Funding rate for one period.  Positive → longs pay; negative → shorts pay.
    function _fundingRate() internal view returns (int256) {
        uint256 longOI  = totalLongSize;
        uint256 shortOI = totalShortSize;
        if (longOI + shortOI == 0) return 0;

        int256 imbalance; // as signed BPS

        if (longOI >= shortOI) {
            uint256 diff    = longOI - shortOI;
            uint256 rateBps = (diff * MAX_FUNDING_RATE_BPS) / (longOI + shortOI);
            require(rateBps <= uint256(type(int256).max), "overflow");
            imbalance = _toInt256(rateBps);
        } else {
            uint256 diff    = shortOI - longOI;
            uint256 rateBps = (diff * MAX_FUNDING_RATE_BPS) / (longOI + shortOI);
            require(rateBps <= uint256(type(int256).max), "overflow");
            imbalance = -_toInt256(rateBps);
        }

        return imbalance;
    }

    // ─── Internal: PnL ────────────────────────────────────────────────────────

    /// @dev Compute unrealized PnL and total funding payment for `pos` at `exitPrice`.
    function _computePnL(Position storage pos, uint256 exitPrice)
        internal
        view
        returns (int256 pnl, uint256 fundingPayment)
    {
        // Price PnL
        if (pos.isLong) {
            if (exitPrice >= pos.entryPrice) {
                uint256 gain = ((exitPrice - pos.entryPrice) * pos.size) / pos.entryPrice;
                pnl = _toInt256(gain);
            } else {
                uint256 loss = ((pos.entryPrice - exitPrice) * pos.size) / pos.entryPrice;
                pnl = -_toInt256(loss);
            }
        } else {
            if (exitPrice <= pos.entryPrice) {
                uint256 gain = ((pos.entryPrice - exitPrice) * pos.size) / pos.entryPrice;
                pnl = _toInt256(gain);
            } else {
                uint256 loss = ((exitPrice - pos.entryPrice) * pos.size) / pos.entryPrice;
                pnl = -_toInt256(loss);
            }
        }

        // Funding payment: rate delta × size / BPS
        int256 fundingDelta = cumulativeFundingRate - pos.fundingIndex;
        int256 rawFunding   = (fundingDelta * _toInt256(pos.size)) / _toInt256(BPS);
        // Longs pay when positive, shorts pay when negative.
        if (pos.isLong) {
            fundingPayment = rawFunding > 0 ? _toUint256(rawFunding) : 0;
            if (rawFunding < 0) {
                pnl += (-rawFunding); // shorts paid longs
            }
        } else {
            fundingPayment = rawFunding < 0 ? _negToUint256(rawFunding) : 0;
            if (rawFunding > 0) {
                pnl += rawFunding; // longs paid shorts
            }
        }
    }

    function _currentPrice() internal view returns (uint256) {
        (uint256 price, uint256 updatedAt) = IGhostOracleDeriv(oracle).latestAnswer();
        require(price > 0, "GhostDerivatives: zero price");
        require(block.timestamp - updatedAt <= ORACLE_MAX_AGE, "GhostDerivatives: stale oracle");
        return price;
    }

    // ─── Safe-cast helpers ────────────────────────────────────────────────────

    /// @dev Safely cast uint256 → int256 (revert if > max int256).
    function _toInt256(uint256 x) internal pure returns (int256 r) {
        require(x <= uint256(type(int256).max), "GhostDerivatives: int256 overflow");
        // Assembly avoids forge-lint false-positive inside the guard.
        assembly { r := x }
    }

    /// @dev Safely cast int256 → uint256 (revert if negative).
    function _toUint256(int256 x) internal pure returns (uint256 r) {
        require(x >= 0, "GhostDerivatives: negative cast");
        assembly { r := x }
    }

    /// @dev Safely negate int256 and cast to uint256 (x must be ≤ 0 and > type(int256).min).
    function _negToUint256(int256 x) internal pure returns (uint256 r) {
        require(x <= 0, "GhostDerivatives: not negative");
        require(x > type(int256).min, "GhostDerivatives: int256 underflow");
        int256 negX = -x;
        assembly { r := negX }
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Margin ratio of `posId` (1e18-scaled; < MAINTENANCE_MARGIN_BPS/BPS = liquidatable).
    function marginRatio(uint256 posId) external view returns (uint256) {
        Position storage pos = positions[posId];
        if (!pos.open || pos.size == 0) return 0;
        (int256 pnl, uint256 funding) = _computePnL(pos, _currentPrice());
        int256 effective              = _toInt256(pos.margin) + pnl - _toInt256(funding);
        if (effective <= 0) return 0;
        return (_toUint256(effective) * BPS * 1e18) / pos.size;
    }

    /// @notice Unrealized PnL of `posId` at current oracle price.
    function unrealizedPnL(uint256 posId) external view returns (int256 pnl) {
        Position storage pos = positions[posId];
        if (!pos.open) return 0;
        (pnl,) = _computePnL(pos, _currentPrice());
    }

    /// @notice All position IDs opened by `trader`.
    function positionsOf(address trader) external view returns (uint256[] memory) {
        return _traderPositions[trader];
    }

    /// @notice Current mark price from the oracle (PRICE_PRECISION).
    function markPrice() external view returns (uint256) {
        return _currentPrice();
    }

    /// @notice Current unsigned funding rate (BPS) for the next period.
    function currentFundingRate() external view returns (int256) {
        return _fundingRate();
    }

    /// @notice Open-interest imbalance: longs vs shorts (signed, in GST).
    function openInterestImbalance() external view returns (int256) {
        return _toInt256(totalLongSize) - _toInt256(totalShortSize);
    }
}
