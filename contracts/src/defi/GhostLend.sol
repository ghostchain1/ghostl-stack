// GhostChain Contracts v5.6.1 (defi/GhostLend.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

// ─── File-level interfaces ────────────────────────────────────────────────────

interface IGST20Lend {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────

/// @title  GhostLend
/// @notice Overcollateralized single-pool GST lending protocol for GhostChain.
///
///         Users deposit GST as collateral and borrow up to 80 % of its value.
///         Interest accrues per-block via a two-slope kink utilization model.
///         Positions below the 85 % liquidation threshold can be liquidated at
///         a 5 % bonus to the liquidator.
///
///         Governance may pause the market and withdraw accrued protocol reserves.
contract GhostLend is GhostBrand, ReentrancyGuard {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @dev Basis-point denominator (10 000 = 100 %).
    uint256 public constant BPS = 10_000;

    /// @dev Maximum LTV before a borrow is rejected (80 %).
    uint256 public constant COLLATERAL_FACTOR = 8_000;

    /// @dev LTV at which a position can be liquidated (85 %).
    uint256 public constant LIQUIDATION_THRESHOLD = 8_500;

    /// @dev Bonus seized by the liquidator on top of the repaid amount (5 %).
    uint256 public constant LIQUIDATION_BONUS = 500;

    /// @dev Share of interest that flows to the protocol reserve (10 %).
    uint256 public constant PROTOCOL_RESERVE_BPS = 1_000;

    // Two-slope interest-rate model (per-block, 1e18-scaled).
    // Approximated for ~5 000 000 GhostChain blocks per year.
    uint256 public constant BASE_RATE_PER_BLOCK = 158e9;   // ≈ 5 % APY
    uint256 public constant KINK_UTILIZATION    = 8_000;   // 80 % kink
    uint256 public constant SLOPE1_PER_BLOCK    = 317e9;   // ≈ 10 % APY below kink
    uint256 public constant SLOPE2_PER_BLOCK    = 3_170e9; // ≈ 100 % APY above kink

    /// @dev Starting value of the borrow-interest accumulator.
    uint256 public constant INTEREST_INDEX_BASE = 1e18;

    // ─── Immutables ───────────────────────────────────────────────────────────

    address public immutable GST_TOKEN;
    address public immutable TREASURY;

    // ─── Mutable state ────────────────────────────────────────────────────────

    address public governance;

    uint256 public totalDeposits;     // Σ GST deposited (collateral pool)
    uint256 public totalBorrows;      // Σ GST owed (principal + accrued interest)
    uint256 public totalReserves;     // Protocol's cut of accrued interest (virtual)
    uint256 public borrowIndex;       // Compound-interest accumulator (1e18-based)
    uint256 public lastAccrualBlock;  // Block of last interest accrual

    mapping(address => uint256) public deposits;        // user → GST deposited
    mapping(address => uint256) public borrowShares;    // user → scaled borrow principal
    mapping(address => uint256) public borrowIndexAt;   // user → borrow-index snapshot

    bool public paused;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 repaid, uint256 debtRemaining);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 repaid, uint256 seized);
    event InterestAccrued(uint256 newBorrowIndex, uint256 interestAdded, uint256 reserveAdded);
    event ReservesWithdrawn(address indexed to, uint256 amount);
    event PausedSet(bool state);
    event GovernanceTransferred(address indexed prev, address indexed next);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error MarketPaused();
    error ZeroAmount();
    error ExceedsBorrowLimit();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error BorrowerIsHealthy();
    error ExceedsReserves();
    error NotGovernance();

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

    constructor(address gstToken, address treasury, address gov) {
        GST_TOKEN        = gstToken;
        TREASURY         = treasury;
        governance       = gov;
        borrowIndex      = INTEREST_INDEX_BASE;
        lastAccrualBlock = block.number;
    }

    // ─── Core: Supply ─────────────────────────────────────────────────────────

    /// @notice Deposit `amount` GST as collateral.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();

        require(
            IGST20Lend(GST_TOKEN).transferFrom(msg.sender, address(this), amount),
            "GST: transferFrom failed"
        );

        deposits[msg.sender] += amount;
        totalDeposits        += amount;

        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw `amount` GST from collateral (only free collateral not backing borrows).
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();

        uint256 free = _freeCollateral(msg.sender);
        require(amount <= free, "GhostLend: insufficient free collateral");

        deposits[msg.sender] -= amount;
        totalDeposits        -= amount;

        require(IGST20Lend(GST_TOKEN).transfer(msg.sender, amount), "GST: transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ─── Core: Borrow ─────────────────────────────────────────────────────────

    /// @notice Borrow `amount` GST against deposited collateral.
    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();

        uint256 debt      = _currentDebt(msg.sender);
        uint256 maxBorrow = (deposits[msg.sender] * COLLATERAL_FACTOR) / BPS;
        if (debt + amount > maxBorrow) revert ExceedsBorrowLimit();

        uint256 liquidity = IGST20Lend(GST_TOKEN).balanceOf(address(this));
        if (amount > liquidity) revert InsufficientLiquidity();

        // Store as scaled shares relative to current borrow index.
        uint256 newShares = (amount * INTEREST_INDEX_BASE) / borrowIndex;
        borrowShares[msg.sender]  += newShares;
        borrowIndexAt[msg.sender]  = borrowIndex;
        totalBorrows              += amount;

        require(IGST20Lend(GST_TOKEN).transfer(msg.sender, amount), "GST: transfer failed");

        emit Borrowed(msg.sender, amount);
    }

    // ─── Core: Repay ─────────────────────────────────────────────────────────

    /// @notice Repay up to `amount` GST of your outstanding debt.
    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();

        uint256 debt   = _currentDebt(msg.sender);
        if (debt == 0) revert ZeroAmount();
        uint256 repaid = amount > debt ? debt : amount;

        require(
            IGST20Lend(GST_TOKEN).transferFrom(msg.sender, address(this), repaid),
            "GST: transferFrom failed"
        );

        _reduceBorrow(msg.sender, repaid);

        emit Repaid(msg.sender, repaid, _currentDebt(msg.sender));
    }

    // ─── Core: Liquidate ─────────────────────────────────────────────────────

    /// @notice Liquidate an undercollateralized position.
    ///         Caller repays `repayAmount` of `borrower`'s debt and receives
    ///         collateral at a 5 % bonus.
    function liquidate(address borrower, uint256 repayAmount) external nonReentrant whenNotPaused {
        if (repayAmount == 0) revert ZeroAmount();
        _accrueInterest();

        uint256 debt      = _currentDebt(borrower);
        uint256 threshold = (deposits[borrower] * LIQUIDATION_THRESHOLD) / BPS;
        if (debt <= threshold) revert BorrowerIsHealthy();

        uint256 repaid = repayAmount > debt ? debt : repayAmount;
        uint256 seized = (repaid * (BPS + LIQUIDATION_BONUS)) / BPS;
        if (seized > deposits[borrower]) seized = deposits[borrower];

        require(
            IGST20Lend(GST_TOKEN).transferFrom(msg.sender, address(this), repaid),
            "GST: transferFrom failed"
        );

        _reduceBorrow(borrower, repaid);

        deposits[borrower] -= seized;
        totalDeposits      -= seized;

        require(IGST20Lend(GST_TOKEN).transfer(msg.sender, seized), "GST: transfer failed");

        emit Liquidated(borrower, msg.sender, repaid, seized);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function setPaused(bool state) external onlyGovernance {
        paused = state;
        emit PausedSet(state);
    }

    function transferGovernance(address next) external onlyGovernance {
        require(next != address(0), "GhostLend: zero gov");
        emit GovernanceTransferred(governance, next);
        governance = next;
    }

    /// @notice Move accrued protocol reserves to the treasury.
    function withdrawReserves(uint256 amount) external onlyGovernance {
        if (amount > totalReserves) revert ExceedsReserves();
        uint256 available = IGST20Lend(GST_TOKEN).balanceOf(address(this));
        require(amount <= available, "GhostLend: insufficient liquid reserves");
        totalReserves -= amount;
        require(IGST20Lend(GST_TOKEN).transfer(TREASURY, amount), "GST: transfer failed");
        emit ReservesWithdrawn(TREASURY, amount);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Accrue compound interest since `lastAccrualBlock`.
    function _accrueInterest() internal {
        uint256 delta = block.number - lastAccrualBlock;
        if (delta == 0 || totalBorrows == 0) {
            lastAccrualBlock = block.number;
            return;
        }
        lastAccrualBlock = block.number;

        uint256 rate     = _borrowRate(_utilizationRate());
        uint256 factor   = rate * delta;
        uint256 interest = (totalBorrows * factor) / INTEREST_INDEX_BASE;
        uint256 resShare = (interest * PROTOCOL_RESERVE_BPS) / BPS;

        totalReserves += resShare;
        totalBorrows  += interest;

        uint256 idxDelta = (borrowIndex * factor) / INTEREST_INDEX_BASE;
        borrowIndex      += idxDelta;

        emit InterestAccrued(borrowIndex, interest, resShare);
    }

    /// @dev Reduce `user`'s borrow record by `repaid` GST and update totalBorrows.
    function _reduceBorrow(address user, uint256 repaid) internal {
        uint256 debt   = _currentDebt(user);
        uint256 actual = repaid > debt ? debt : repaid;
        // Convert repaid amount back to shares.
        uint256 sharesRepaid = (actual * INTEREST_INDEX_BASE) / borrowIndex;
        uint256 userShares   = borrowShares[user];
        borrowShares[user]   = userShares > sharesRepaid ? userShares - sharesRepaid : 0;
        borrowIndexAt[user]  = borrowIndex;
        totalBorrows         = totalBorrows > actual ? totalBorrows - actual : 0;
    }

    // ─── Pure / view helpers ──────────────────────────────────────────────────

    function _currentDebt(address user) internal view returns (uint256) {
        if (borrowShares[user] == 0) return 0;
        return (borrowShares[user] * borrowIndex) / INTEREST_INDEX_BASE;
    }

    function _freeCollateral(address user) internal view returns (uint256) {
        uint256 debt = _currentDebt(user);
        if (debt == 0) return deposits[user];
        // Minimum collateral required to back the debt at COLLATERAL_FACTOR.
        uint256 required = (debt * BPS) / COLLATERAL_FACTOR;
        return deposits[user] > required ? deposits[user] - required : 0;
    }

    function _utilizationRate() internal view returns (uint256) {
        uint256 cash = IGST20Lend(GST_TOKEN).balanceOf(address(this));
        uint256 borr = totalBorrows;
        if (cash + borr == 0) return 0;
        return (borr * BPS) / (cash + borr);
    }

    function _borrowRate(uint256 util) internal pure returns (uint256) {
        if (util <= KINK_UTILIZATION) {
            return BASE_RATE_PER_BLOCK + (util * SLOPE1_PER_BLOCK) / BPS;
        }
        uint256 excess = util - KINK_UTILIZATION;
        return BASE_RATE_PER_BLOCK
            + (KINK_UTILIZATION * SLOPE1_PER_BLOCK) / BPS
            + (excess * SLOPE2_PER_BLOCK) / BPS;
    }

    // ─── External views ───────────────────────────────────────────────────────

    /// @notice Current debt (principal + interest) of `user` in GST.
    function currentDebt(address user) external view returns (uint256) {
        return _currentDebt(user);
    }

    /// @notice Health factor of `user` (1e18-scaled; < 1e18 = liquidatable).
    function healthFactor(address user) external view returns (uint256) {
        uint256 debt = _currentDebt(user);
        if (debt == 0) return type(uint256).max;
        return (deposits[user] * COLLATERAL_FACTOR * 1e18) / (debt * BPS);
    }

    /// @notice Current per-block borrow rate (1e18-scaled).
    function currentBorrowRate() external view returns (uint256) {
        return _borrowRate(_utilizationRate());
    }

    /// @notice Current utilization rate in BPS.
    function currentUtilization() external view returns (uint256) {
        return _utilizationRate();
    }

    /// @notice Maximum additional GST `user` can borrow without being liquidatable.
    function freeCollateral(address user) external view returns (uint256) {
        return _freeCollateral(user);
    }
}
