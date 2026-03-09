// GhostChain Contracts v5.6.1 (defi/GhostYield.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

// ─── File-level interfaces ────────────────────────────────────────────────────

/// @dev Minimal GST20 surface for yield-vault token interactions.
interface IGST20Yield {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Strategy adapter — any protocol (GhostLend, GhostLiquidStaking, GhostXLP) must implement this.
interface IYieldStrategy {
    /// @notice Deposit `amount` GST into the strategy and return GST-equivalent deployed.
    function strategyDeposit(uint256 amount) external returns (uint256 deployed);

    /// @notice Withdraw `amount` GST from the strategy; return actual GST received.
    function strategyWithdraw(uint256 amount) external returns (uint256 received);

    /// @notice Return estimated total GST value held in the strategy.
    function strategyBalance() external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────

/// @title  GhostYield
/// @notice Multi-strategy GST yield aggregator for GhostChain.
///
///         Users deposit GST and receive **yGST** — a share token representing
///         their proportional claim on the vault.  The vault routes capital across
///         registered yield strategies (GhostLend supply, GhostLiquidStaking,
///         GhostXchange LP, etc.) according to governance-set allocations.
///
///         Any caller may trigger `harvest()` which compounds accumulated yield
///         and takes a 10 % performance fee for the GhostChain treasury.
///
///         yGST is a GRC-20-compatible token freely transferable and composable
///         with other GhostChain DeFi protocols.
contract GhostYield is GhostBrand, ReentrancyGuard {

    // ─── yGST token metadata ──────────────────────────────────────────────────

    string  public constant TOKEN_NAME     = "Ghost Yield GST";
    string  public constant TOKEN_SYMBOL   = "yGST";
    uint8   public constant TOKEN_DECIMALS = 18;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS                  = 10_000;
    uint256 public constant PERFORMANCE_FEE_BPS  = 1_000;  // 10 % of harvest yield
    uint256 public constant MAX_STRATEGIES       = 10;
    uint256 public constant SHARES_PRECISION     = 1e18;

    // ─── Immutables ───────────────────────────────────────────────────────────

    address public immutable GST_TOKEN;
    address public immutable TREASURY;

    // ─── Mutable state ────────────────────────────────────────────────────────

    address public governance;
    bool    public depositsPaused;

    // yGST GRC-20 state
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Strategy registry
    struct Strategy {
        address target;      // IYieldStrategy implementation
        uint256 allocation;  // Target allocation in BPS (sum across active must be ≤ BPS)
        uint256 deployed;    // GST currently deployed to this strategy
        bool    active;
    }

    Strategy[] public strategies;

    // Idle GST held in this contract (not yet deployed to any strategy).
    // totalAssets() = idleGST + Σ strategies[i].deployed
    uint256 public idleGST;

    // Highest recorded total-assets value (used for high-watermark performance fee).
    uint256 public highWatermark;

    // ─── Events ───────────────────────────────────────────────────────────────

    // yGST GRC-20 events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Vault events
    event Deposited(address indexed user, uint256 gstAmount, uint256 sharesIssued);
    event Withdrawn(address indexed user, uint256 sharesRedeemed, uint256 gstReturned);
    event Harvested(address indexed caller, uint256 yieldGST, uint256 feeTaken);
    event Rebalanced(address indexed caller);

    // Strategy management
    event StrategyAdded(uint256 indexed id, address indexed target, uint256 allocation);
    event StrategyUpdated(uint256 indexed id, uint256 newAllocation);
    event StrategyRemoved(uint256 indexed id);
    event StrategyDeployed(uint256 indexed id, uint256 amount);
    event StrategyWithdrawn(uint256 indexed id, uint256 amount);

    // Admin events
    event PausedSet(bool state);
    event GovernanceTransferred(address indexed prev, address indexed next);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error DepositsPaused();
    error ZeroAmount();
    error ZeroShares();
    error ExceedsShares();
    error TooManyStrategies();
    error AllocationOverflow();
    error InvalidStrategy();
    error NotGovernance();
    error StrategyInactive();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier whenDepositsOpen() {
        _whenDepositsOpen();
        _;
    }

    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _whenDepositsOpen() internal view {
        if (depositsPaused) revert DepositsPaused();
    }

    function _onlyGovernance() internal view {
        if (msg.sender != governance) revert NotGovernance();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address gstToken, address treasury, address gov) {
        GST_TOKEN  = gstToken;
        TREASURY   = treasury;
        governance = gov;
    }

    // ─── yGST GRC-20 ──────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transferShares(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "yGST: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transferShares(from, to, amount);
        return true;
    }

    function _transferShares(address from, address to, uint256 amount) internal {
        require(to != address(0), "yGST: transfer to zero");
        require(sharesOf[from] >= amount, "yGST: insufficient balance");
        unchecked {
            sharesOf[from] -= amount;
            sharesOf[to]   += amount;
        }
        emit Transfer(from, to, amount);
    }

    // ─── Core: Deposit ───────────────────────────────────────────────────────

    /// @notice Deposit `amount` GST; receive yGST shares.
    function deposit(uint256 amount) external nonReentrant whenDepositsOpen returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();

        uint256 totalBefore = totalAssets();
        require(
            IGST20Yield(GST_TOKEN).transferFrom(msg.sender, address(this), amount),
            "GST: transferFrom failed"
        );
        idleGST += amount;

        // Shares minted = amount * totalShares / totalAssetsBefore (first deposit: 1:1)
        if (totalShares == 0 || totalBefore == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / totalBefore;
        }
        if (shares == 0) revert ZeroShares();

        _mintShares(msg.sender, shares);
        emit Deposited(msg.sender, amount, shares);
    }

    // ─── Core: Withdraw ──────────────────────────────────────────────────────

    /// @notice Redeem `shares` yGST for GST (pro-rata claim on total assets).
    function withdraw(uint256 shares) external nonReentrant returns (uint256 gstOut) {
        if (shares == 0) revert ZeroAmount();
        if (sharesOf[msg.sender] < shares) revert ExceedsShares();

        uint256 total = totalAssets();
        gstOut = (shares * total) / totalShares;
        if (gstOut == 0) revert ZeroAmount();

        _burnShares(msg.sender, shares);

        // Source GST from idle first, then pull from strategies if needed.
        gstOut = _ensureLiquidity(gstOut);

        require(IGST20Yield(GST_TOKEN).transfer(msg.sender, gstOut), "GST: transfer failed");

        emit Withdrawn(msg.sender, shares, gstOut);
    }

    // ─── Core: Harvest ───────────────────────────────────────────────────────

    /// @notice Harvest yield from all strategies, compound into the vault, take fee.
    ///         Anyone may call this; the performance fee goes to the treasury.
    function harvest() external nonReentrant {
        uint256 before = totalAssets();

        // Pull idle balance (may have grown from strategy callbacks, reward tokens, etc.)
        uint256 contractBal = IGST20Yield(GST_TOKEN).balanceOf(address(this));
        if (contractBal > idleGST) {
            idleGST = contractBal; // absorb any external GST sent to the vault
        }

        // Update strategy balances.
        for (uint256 i = 0; i < strategies.length; i++) {
            if (!strategies[i].active) continue;
            strategies[i].deployed = IYieldStrategy(strategies[i].target).strategyBalance();
        }

        uint256 after_ = totalAssets();
        if (after_ <= before) {
            emit Harvested(msg.sender, 0, 0);
            return;
        }

        uint256 yield_ = after_ - before;

        // Performance fee only on yield above highWatermark.
        uint256 fee = 0;
        if (after_ > highWatermark) {
            uint256 gainAboveHWM = after_ - highWatermark;
            uint256 feeableYield = gainAboveHWM < yield_ ? gainAboveHWM : yield_;
            fee = (feeableYield * PERFORMANCE_FEE_BPS) / BPS;
        }
        highWatermark = after_;

        // Mint yGST shares to treasury representing the performance fee.
        if (fee > 0 && totalShares > 0) {
            uint256 feeShares = (fee * totalShares) / after_;
            _mintShares(TREASURY, feeShares);
        }

        emit Harvested(msg.sender, yield_, fee);
    }

    // ─── Governance: Strategy Management ─────────────────────────────────────

    /// @notice Add a new yield strategy.
    function addStrategy(address target, uint256 allocationBps) external onlyGovernance {
        require(target != address(0), "GhostYield: zero target");
        if (strategies.length >= MAX_STRATEGIES) revert TooManyStrategies();
        _validateAllocations(allocationBps, type(uint256).max);

        uint256 id = strategies.length;
        strategies.push(Strategy({
            target:     target,
            allocation: allocationBps,
            deployed:   0,
            active:     true
        }));
        emit StrategyAdded(id, target, allocationBps);
    }

    /// @notice Update the target allocation for strategy `id`.
    function updateStrategyAllocation(uint256 id, uint256 newAllocationBps) external onlyGovernance {
        require(id < strategies.length, "GhostYield: invalid id");
        require(strategies[id].active,  "GhostYield: inactive");
        _validateAllocations(newAllocationBps, id);
        strategies[id].allocation = newAllocationBps;
        emit StrategyUpdated(id, newAllocationBps);
    }

    /// @notice Deactivate strategy `id`; first pull all capital back to idle.
    function removeStrategy(uint256 id) external onlyGovernance nonReentrant {
        require(id < strategies.length, "GhostYield: invalid id");
        require(strategies[id].active,  "GhostYield: already inactive");

        uint256 deployed = strategies[id].deployed;
        if (deployed > 0) {
            uint256 received = IYieldStrategy(strategies[id].target).strategyWithdraw(deployed);
            strategies[id].deployed = 0;
            idleGST += received;
            emit StrategyWithdrawn(id, received);
        }
        strategies[id].active     = false;
        strategies[id].allocation = 0;
        emit StrategyRemoved(id);
    }

    /// @notice Deploy idle GST into strategies according to their target allocations.
    function rebalance() external nonReentrant onlyGovernance {
        uint256 idle = idleGST;
        if (idle == 0) return;

        for (uint256 i = 0; i < strategies.length; i++) {
            if (!strategies[i].active || strategies[i].allocation == 0) continue;
            uint256 toDeploy = (idle * strategies[i].allocation) / BPS;
            if (toDeploy == 0) continue;
            if (toDeploy > idleGST) toDeploy = idleGST;
            if (toDeploy == 0) break;

            // Approve strategy to pull GST during strategyDeposit.
            require(
                IGST20Yield(GST_TOKEN).approve(strategies[i].target, toDeploy),
                "GST: approve failed"
            );
            uint256 deployed = IYieldStrategy(strategies[i].target).strategyDeposit(toDeploy);
            strategies[i].deployed += deployed;
            idleGST                -= toDeploy;

            emit StrategyDeployed(i, deployed);
        }
        emit Rebalanced(msg.sender);
    }

    function setPaused(bool state) external onlyGovernance {
        depositsPaused = state;
        emit PausedSet(state);
    }

    function transferGovernance(address next) external onlyGovernance {
        require(next != address(0), "GhostYield: zero gov");
        emit GovernanceTransferred(governance, next);
        governance = next;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _mintShares(address to, uint256 amount) internal {
        require(to != address(0), "yGST: mint to zero");
        sharesOf[to]  += amount;
        totalShares   += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burnShares(address from, uint256 amount) internal {
        require(sharesOf[from] >= amount, "yGST: burn exceeds balance");
        unchecked {
            sharesOf[from] -= amount;
            totalShares    -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    /// @dev Ensure `amount` GST is liquid in this contract (pull from strategies if needed).
    function _ensureLiquidity(uint256 amount) internal returns (uint256) {
        if (idleGST >= amount) {
            idleGST -= amount;
            return amount;
        }
        uint256 needed = amount - idleGST;
        uint256 pulled = 0;

        for (uint256 i = 0; i < strategies.length && pulled < needed; i++) {
            if (!strategies[i].active || strategies[i].deployed == 0) continue;
            uint256 toWithdraw = needed - pulled;
            if (toWithdraw > strategies[i].deployed) toWithdraw = strategies[i].deployed;
            uint256 received = IYieldStrategy(strategies[i].target).strategyWithdraw(toWithdraw);
            strategies[i].deployed -= received < strategies[i].deployed ? received : strategies[i].deployed;
            pulled += received;
            emit StrategyWithdrawn(i, received);
        }

        uint256 totalLiquid = idleGST + pulled;
        uint256 actual      = totalLiquid < amount ? totalLiquid : amount;
        idleGST = totalLiquid > actual ? totalLiquid - actual : 0;
        return actual;
    }

    /// @dev Validate that adding `newBps` (for strategy `skipId`) doesn't exceed 100 %.
    function _validateAllocations(uint256 newBps, uint256 skipId) internal view {
        uint256 sum = newBps;
        for (uint256 i = 0; i < strategies.length; i++) {
            if (i == skipId || !strategies[i].active) continue;
            sum += strategies[i].allocation;
        }
        if (sum > BPS) revert AllocationOverflow();
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Total GST managed by the vault (idle + all strategy balances).
    function totalAssets() public view returns (uint256 total) {
        total = idleGST;
        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategies[i].active) {
                total += strategies[i].deployed;
            }
        }
    }

    /// @notice GST value of `shares` yGST at current exchange rate.
    function convertToAssets(uint256 shares) external view returns (uint256) {
        if (totalShares == 0) return shares;
        return (shares * totalAssets()) / totalShares;
    }

    /// @notice yGST shares equivalent to `assets` GST at current exchange rate.
    function convertToShares(uint256 assets) external view returns (uint256) {
        uint256 total = totalAssets();
        if (totalShares == 0 || total == 0) return assets;
        return (assets * totalShares) / total;
    }

    /// @notice Number of registered strategies (active and inactive).
    function strategyCount() external view returns (uint256) {
        return strategies.length;
    }
}
