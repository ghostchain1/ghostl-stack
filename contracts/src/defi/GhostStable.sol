// GhostChain Contracts v5.6.1 (defi/GhostStable.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

// ─── File-level interfaces ────────────────────────────────────────────────────

/// @dev Minimal GST20 surface used by GhostStable for collateral transfers.
interface IGST20Stable {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Price oracle — returns GST price in USD with 1e8 precision (e.g. 1 GST = $4.20 → 420_000_000).
interface IGhostOracle {
    function latestAnswer() external view returns (uint256 price, uint256 updatedAt);
}

// ─────────────────────────────────────────────────────────────────────────────

/// @title  GhostStable
/// @notice GST-overcollateralized stablecoin protocol issuing **gUSD** on GhostChain.
///
///         Users open vaults by depositing GST collateral and minting gUSD at a
///         minimum collateral ratio of 200 %.  A stability fee of 2 % per year
///         accrues on each vault's outstanding gUSD debt.
///
///         Vaults below the 150 % liquidation ratio can be liquidated: the
///         liquidator burns gUSD and receives the vault's collateral at a 10 %
///         bonus.
///
///         gUSD itself is a built-in GRC-20 token managed by this contract.
///         No external minter is needed.
contract GhostStable is GhostBrand, ReentrancyGuard {

    // ─── gUSD token metadata ──────────────────────────────────────────────────

    string  public constant TOKEN_NAME     = "Ghost USD";
    string  public constant TOKEN_SYMBOL   = "gUSD";
    uint8   public constant TOKEN_DECIMALS = 18;

    // ─── Protocol constants ───────────────────────────────────────────────────

    uint256 public constant BPS = 10_000;

    /// @dev Minimum collateral ratio for opening / after minting (200 %).
    uint256 public constant MIN_COLLATERAL_RATIO    = 200;

    /// @dev Collateral ratio at which liquidation is permitted (150 %).
    uint256 public constant LIQUIDATION_RATIO       = 150;

    /// @dev Bonus collateral given to the liquidator (10 %).
    uint256 public constant LIQUIDATION_BONUS_PCT   = 10;

    /// @dev Annual stability fee on minted gUSD (2 %).
    uint256 public constant STABILITY_FEE_BPS       = 200;

    /// @dev Precision used by the oracle (1e8 = $1.00).
    uint256 public constant ORACLE_PRECISION        = 1e8;

    /// @dev gUSD always pegged to 1 USD with 1e8 precision.
    uint256 public constant GUSD_USD_PRICE          = 1e8;

    // ─── Immutables ───────────────────────────────────────────────────────────

    address public immutable GST_TOKEN;
    address public immutable TREASURY;

    // ─── Mutable state ────────────────────────────────────────────────────────

    address public governance;
    address public oracle;       // IGhostOracle implementation
    bool    public paused;

    // gUSD GRC-20 state
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Vault state
    uint256 private _nextVaultId;
    mapping(uint256 => Vault)   public vaults;
    mapping(address => uint256[]) private _ownerVaults;

    struct Vault {
        address owner;
        uint256 collateral;  // GST deposited (1e18-scaled)
        uint256 debt;        // gUSD minted (1e18-scaled), excluding unpaid fee
        uint64  lastFeeTime; // timestamp of last stability-fee accrual
        bool    active;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    // gUSD GRC-20 events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Vault events
    event VaultOpened(uint256 indexed vaultId, address indexed owner);
    event CollateralDeposited(uint256 indexed vaultId, uint256 amount);
    event CollateralWithdrawn(uint256 indexed vaultId, uint256 amount);
    event GUSDMinted(uint256 indexed vaultId, uint256 amount);
    event GUSDBurned(uint256 indexed vaultId, uint256 amount);
    event StabilityFeeCharged(uint256 indexed vaultId, uint256 feeGUSD);
    event Liquidated(uint256 indexed vaultId, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized);
    event VaultClosed(uint256 indexed vaultId);

    // Admin events
    event PausedSet(bool state);
    event OracleUpdated(address indexed prev, address indexed next);
    event GovernanceTransferred(address indexed prev, address indexed next);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error MarketPaused();
    error ZeroAmount();
    error NotVaultOwner();
    error VaultNotActive();
    error CollateralRatioBelowMin();
    error VaultIsSafe();
    error InsufficientDebt();
    error OracleStaleOrZero();
    error NotGovernance();
    error VaultHasDebt();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    modifier onlyVaultOwner(uint256 vaultId) {
        _onlyVaultOwner(vaultId);
        _;
    }

    function _whenNotPaused() internal view {
        if (paused) revert MarketPaused();
    }

    function _onlyGovernance() internal view {
        if (msg.sender != governance) revert NotGovernance();
    }

    function _onlyVaultOwner(uint256 vaultId) internal view {
        if (vaults[vaultId].owner != msg.sender) revert NotVaultOwner();
        if (!vaults[vaultId].active)             revert VaultNotActive();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address gstToken, address treasury, address gov, address oracleAddr) {
        GST_TOKEN  = gstToken;
        TREASURY   = treasury;
        governance = gov;
        oracle     = oracleAddr;
    }

    // ─── gUSD GRC-20 ──────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "gUSD: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "gUSD: transfer to zero");
        require(balanceOf[from] >= amount, "gUSD: insufficient balance");
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to]   += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "gUSD: mint to zero");
        totalSupply    += amount;
        balanceOf[to]  += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        require(balanceOf[from] >= amount, "gUSD: burn exceeds balance");
        unchecked {
            balanceOf[from] -= amount;
            totalSupply     -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    // ─── Vault: lifecycle ────────────────────────────────────────────────────

    /// @notice Open a new vault (zero collateral, zero debt).  Returns the vault ID.
    function openVault() external whenNotPaused returns (uint256 vaultId) {
        vaultId = _nextVaultId++;
        require(block.timestamp <= type(uint64).max, "ts overflow");
        vaults[vaultId] = Vault({
            owner:       msg.sender,
            collateral:  0,
            debt:        0,
            lastFeeTime: uint64(block.timestamp),
            active:      true
        });
        _ownerVaults[msg.sender].push(vaultId);
        emit VaultOpened(vaultId, msg.sender);
    }

    /// @notice Deposit `amount` GST into `vaultId`.
    function depositCollateral(uint256 vaultId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyVaultOwner(vaultId)
    {
        if (amount == 0) revert ZeroAmount();
        require(
            IGST20Stable(GST_TOKEN).transferFrom(msg.sender, address(this), amount),
            "GST: transferFrom failed"
        );
        vaults[vaultId].collateral += amount;
        emit CollateralDeposited(vaultId, amount);
    }

    /// @notice Withdraw `amount` GST from `vaultId` (only free collateral).
    function withdrawCollateral(uint256 vaultId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyVaultOwner(vaultId)
    {
        if (amount == 0) revert ZeroAmount();
        _accrueStabilityFee(vaultId);

        uint256 free = _freeCollateral(vaultId);
        require(amount <= free, "GhostStable: insufficient free collateral");

        vaults[vaultId].collateral -= amount;
        require(IGST20Stable(GST_TOKEN).transfer(msg.sender, amount), "GST: transfer failed");
        emit CollateralWithdrawn(vaultId, amount);
    }

    /// @notice Mint `amount` gUSD from `vaultId`.
    function mintGUSD(uint256 vaultId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyVaultOwner(vaultId)
    {
        if (amount == 0) revert ZeroAmount();
        _accrueStabilityFee(vaultId);

        vaults[vaultId].debt += amount;
        _checkCollateralRatio(vaultId, MIN_COLLATERAL_RATIO);

        _mint(msg.sender, amount);
        emit GUSDMinted(vaultId, amount);
    }

    /// @notice Burn `amount` gUSD and reduce `vaultId` debt.
    function burnGUSD(uint256 vaultId, uint256 amount)
        external
        nonReentrant
        onlyVaultOwner(vaultId)
    {
        if (amount == 0) revert ZeroAmount();
        _accrueStabilityFee(vaultId);

        uint256 debt = vaults[vaultId].debt;
        uint256 burn = amount > debt ? debt : amount;
        vaults[vaultId].debt = debt - burn;

        _burn(msg.sender, burn);
        emit GUSDBurned(vaultId, burn);
    }

    /// @notice Close `vaultId` after repaying all debt and reclaim collateral.
    function closeVault(uint256 vaultId)
        external
        nonReentrant
        whenNotPaused
        onlyVaultOwner(vaultId)
    {
        _accrueStabilityFee(vaultId);
        if (vaults[vaultId].debt != 0) revert VaultHasDebt();

        uint256 col = vaults[vaultId].collateral;
        vaults[vaultId].collateral = 0;
        vaults[vaultId].active     = false;

        if (col > 0) {
            require(IGST20Stable(GST_TOKEN).transfer(msg.sender, col), "GST: transfer failed");
        }
        emit VaultClosed(vaultId);
    }

    // ─── Liquidation ─────────────────────────────────────────────────────────

    /// @notice Liquidate an undercollateralized vault.
    ///         Caller burns `debtToCover` gUSD and receives seized GST at a 10 % bonus.
    function liquidate(uint256 vaultId, uint256 debtToCover) external nonReentrant whenNotPaused {
        if (debtToCover == 0) revert ZeroAmount();
        _accrueStabilityFee(vaultId);

        Vault storage v = vaults[vaultId];
        require(v.active, "GhostStable: vault not active");

        if (!_isLiquidatable(vaultId)) revert VaultIsSafe();

        uint256 repay = debtToCover > v.debt ? v.debt : debtToCover;
        _burn(msg.sender, repay);
        v.debt -= repay;

        // Seized collateral: repaid gUSD converted to GST at oracle price, +10 % bonus.
        uint256 gstPrice      = _gstUsdPrice();
        // repay is in gUSD (1 gUSD = 1 USD = ORACLE_PRECISION).
        // collateralUSD = seized GST * gstPrice / ORACLE_PRECISION
        // seized = repay * ORACLE_PRECISION / gstPrice * (100 + bonus) / 100
        uint256 seizedBase    = (repay * ORACLE_PRECISION) / gstPrice;
        uint256 seized        = (seizedBase * (100 + LIQUIDATION_BONUS_PCT)) / 100;
        if (seized > v.collateral) seized = v.collateral;

        v.collateral -= seized;
        require(IGST20Stable(GST_TOKEN).transfer(msg.sender, seized), "GST: transfer failed");

        emit Liquidated(vaultId, msg.sender, repay, seized);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function setPaused(bool state) external onlyGovernance {
        paused = state;
        emit PausedSet(state);
    }

    function setOracle(address next) external onlyGovernance {
        require(next != address(0), "GhostStable: zero oracle");
        emit OracleUpdated(oracle, next);
        oracle = next;
    }

    function transferGovernance(address next) external onlyGovernance {
        require(next != address(0), "GhostStable: zero gov");
        emit GovernanceTransferred(governance, next);
        governance = next;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Accrue stability fee on `vaultId` since `lastFeeTime`.
    function _accrueStabilityFee(uint256 vaultId) internal {
        Vault storage v = vaults[vaultId];
        if (!v.active || v.debt == 0) {
            require(block.timestamp <= type(uint64).max, "ts overflow");
            v.lastFeeTime = uint64(block.timestamp);
            return;
        }
        uint256 elapsed = block.timestamp - uint256(v.lastFeeTime);
        if (elapsed == 0) return;

        // fee = debt * (STABILITY_FEE_BPS / BPS) * elapsed / 365 days
        uint256 fee = (v.debt * STABILITY_FEE_BPS * elapsed) / (BPS * 365 days);
        if (fee > 0) {
            v.debt += fee;
            // Stability fee gUSD is minted to the treasury.
            _mint(TREASURY, fee);
            emit StabilityFeeCharged(vaultId, fee);
        }
        require(block.timestamp <= type(uint64).max, "ts overflow");
        v.lastFeeTime = uint64(block.timestamp);
    }

    /// @dev Revert if the vault's collateral ratio is below `minRatio` (in percent, e.g. 200).
    function _checkCollateralRatio(uint256 vaultId, uint256 minRatio) internal view {
        uint256 ratio = _collateralRatio(vaultId);
        require(ratio >= minRatio * 1e18, "GhostStable: collateral ratio too low");
    }

    /// @dev Collateral ratio in 1e18-scaled percent (e.g. 210 % = 210e18).
    function _collateralRatio(uint256 vaultId) internal view returns (uint256) {
        Vault storage v = vaults[vaultId];
        if (v.debt == 0) return type(uint256).max;
        // colUSD = v.collateral * gstPrice / ORACLE_PRECISION
        // debtUSD = v.debt (gUSD is 1:1 USD)
        // ratio = colUSD * 100 / debtUSD  (in %)
        uint256 gstPrice  = _gstUsdPrice();
        uint256 colUSD    = (v.collateral * gstPrice) / ORACLE_PRECISION;
        // ratio as 1e18 percent
        return (colUSD * 100 * 1e18) / v.debt;
    }

    function _isLiquidatable(uint256 vaultId) internal view returns (bool) {
        return _collateralRatio(vaultId) < LIQUIDATION_RATIO * 1e18;
    }

    /// @dev Collateral that can be withdrawn without breaching MIN_COLLATERAL_RATIO.
    function _freeCollateral(uint256 vaultId) internal view returns (uint256) {
        Vault storage v = vaults[vaultId];
        if (v.debt == 0) return v.collateral;
        uint256 gstPrice    = _gstUsdPrice();
        // minCollateralGST: debt (USD) * MIN_COLLATERAL_RATIO / 100 converted to GST
        uint256 minColUSD   = (v.debt * MIN_COLLATERAL_RATIO) / 100;
        uint256 minColGST   = (minColUSD * ORACLE_PRECISION) / gstPrice;
        return v.collateral > minColGST ? v.collateral - minColGST : 0;
    }

    function _gstUsdPrice() internal view returns (uint256) {
        (uint256 price, uint256 updatedAt) = IGhostOracle(oracle).latestAnswer();
        require(price > 0 && block.timestamp - updatedAt < 1 hours, "GhostStable: stale oracle");
        return price;
    }

    // ─── External views ───────────────────────────────────────────────────────

    /// @notice Collateral ratio of `vaultId` in 1e18-scaled percent.
    function collateralRatio(uint256 vaultId) external view returns (uint256) {
        return _collateralRatio(vaultId);
    }

    /// @notice Whether `vaultId` is currently liquidatable.
    function isLiquidatable(uint256 vaultId) external view returns (bool) {
        _accrueStabilityFeeView(vaultId);
        return _isLiquidatable(vaultId);
    }

    /// @notice All vault IDs owned by `owner`.
    function vaultsOf(address owner) external view returns (uint256[] memory) {
        return _ownerVaults[owner];
    }

    /// @notice Current free collateral in `vaultId` (GST).
    function freeCollateral(uint256 vaultId) external view returns (uint256) {
        return _freeCollateral(vaultId);
    }

    // ─── View-only fee accrual (no state write) ───────────────────────────────

    /// @dev Read-only stability-fee computation to project current debt.
    function _accrueStabilityFeeView(uint256 vaultId) internal view {
        // This is intentionally a no-op view; real accrual requires state writes.
        // Callers should call _accrueStabilityFee before relying on v.debt.
        vaultId; // silence unused-var warning
    }
}
