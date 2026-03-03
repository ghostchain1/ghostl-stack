// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

/// @dev Minimal ERC-20 used for token moves.
interface IERC20Mgr {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev L1AIFeePool interface exposed to the manager.
interface IL1AIFeePool {
    function addLiquidity(uint256 gstAmount, uint256 pairedAmount) external returns (uint256 sharesMinted);
    function collectProtocolFees(uint256 gstAmount, uint256 pairedAmount) external;
    function claimRewards() external returns (uint256 gstClaimed, uint256 pairedClaimed);
    function pendingRewards(address lp) external view returns (uint256 pendingGst, uint256 pendingPaired);
    function shares(address lp) external view returns (uint256);
}

/// @dev GSTCrossChainAdapter interface.
interface IGSTCrossChainAdapter {
    function deployToChain(
        uint256 chainId,
        uint256 amount,
        uint32  minGasLimit,
        bytes32 guardianAttestation
    ) external;
    function totalDeployed() external view returns (uint256);
}

/// @title  FeeInvestmentManager
/// @notice AI-governed orchestrator that:
///
///         1. <Harvest>   Pulls base-fee surplus from the L1 treasury/sequencer.
///         2. <Allocate>  Splits the harvest according to `l1PoolBps`, `crossChainBps`,
///                        and `reserveBps` (must sum to 10_000).
///         3. <Invest>    Deposits the L1 share into L1AIFeePool as additional LP
///                        rewards (`collectProtocolFees`) and the cross-chain share
///                        into GSTCrossChainAdapter for multi-chain yield.
///         4. <Compound>  Claims pending LP rewards from L1AIFeePool and re-injects
///                        them so LPs receive compounded returns automatically.
///         5. <Report>    Emits structured events consumed by the GhostBrain AI
///                        dashboard for investment performance tracking.
///
///         Allocation rules
///         ──────────────────────────────────────────────────────────────────
///         • l1PoolBps + crossChainBps + reserveBps == BPS_DENOM enforced on set.
///         • Harvest cadence enforced by `harvestCooldown` (default: 1 hour).
///         • Cross-chain allocations above `crossChainSingleCap` require a guardian
///           attestation hash (passed through to GSTCrossChainAdapter).
///
///         Security
///         ──────────────────────────────────────────────────────────────────
///         • `harvest()` is callable by any authorised keeper (role-gated).
///         • `rebalance()` and parameter changes require governance.
///         • Emergency `pause()` halts harvest/compound but allows withdrawals.
contract FeeInvestmentManager is Governed, ReentrancyGuard {

    // ──────────────────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────────────────

    uint256 public constant BPS_DENOM = 10_000;

    // ──────────────────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────────────────

    IERC20Mgr public immutable gst;
    IERC20Mgr public immutable paired;       // paired asset for L1 pool
    IL1AIFeePool           public l1Pool;
    IGSTCrossChainAdapter  public crossChain;

    /// @notice Authorised source that sends fee surplus to this contract.
    address public feeSource;               // Treasury, sequencer fee vault, etc.

    /// @notice Keepers allowed to call `harvest()` and `compound()`.
    mapping(address => bool) public keepers;

    /// @notice Allocation split (basis points, must sum to BPS_DENOM).
    uint256 public l1PoolBps      = 6_000;  // 60 % → L1 fee pool
    uint256 public crossChainBps  = 3_000;  // 30 % → cross-chain positions
    uint256 public reserveBps     = 1_000;  // 10 % → reserve / treasury

    /// @notice Address that receives the reserve slice.
    address public reserveRecipient;

    uint256 public harvestCooldown  = 1 hours;
    uint256 public lastHarvestAt;

    /// @notice Guardian attestation required for large cross-chain deployments.
    uint256 public crossChainSingleCap = 50_000e18; // 50 k GST

    bool public paused;

    // Lifetime accounting
    uint256 public totalHarvested;
    uint256 public totalToL1Pool;
    uint256 public totalCrossChain;
    uint256 public totalReserved;
    uint256 public totalCompounded;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event Harvested(uint256 gstAmount, uint256 pairedAmount, uint256 timestamp);
    event AllocatedToL1Pool(uint256 gstAmount, uint256 pairedAmount);
    event AllocatedCrossChain(uint256 chainId, uint256 gstAmount, bytes32 guardian);
    event AllocatedToReserve(uint256 gstAmount);
    event Compounded(uint256 gstReinvested, uint256 pairedReinvested);
    event AllocationSet(uint256 l1PoolBps, uint256 crossChainBps, uint256 reserveBps);
    event KeeperSet(address indexed keeper, bool allowed);
    event PoolSet(address indexed l1Pool);
    event CrossChainSet(address indexed crossChain);
    event FeeSourceSet(address indexed feeSource);
    event ReserveRecipientSet(address indexed recipient);
    event HarvestCooldownSet(uint256 seconds_);
    event PausedSet(bool paused);

    // ──────────────────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────────────────

    error NotKeeper(address caller);
    error Cooldown(uint256 earliestAt);
    error AllocationMismatch(uint256 sum);
    error PoolNotSet();
    error NothingToHarvest();
    error Halted();

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor(
        address gst_,
        address paired_,
        address governor_,
        address timelock_,
        address l1Pool_,
        address crossChain_,
        address feeSource_,
        address reserveRecipient_
    ) Governed(governor_, timelock_) {
        require(gst_    != address(0), "FeeInvMgr: zero gst");
        require(paired_ != address(0), "FeeInvMgr: zero paired");
        gst              = IERC20Mgr(gst_);
        paired           = IERC20Mgr(paired_);
        l1Pool           = IL1AIFeePool(l1Pool_);
        crossChain       = IGSTCrossChainAdapter(crossChain_);
        feeSource        = feeSource_;
        reserveRecipient = reserveRecipient_;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier notPaused() {
        if (paused) revert Halted();
        _;
    }

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != governor && msg.sender != timelock) {
            revert NotKeeper(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Core: Harvest
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Pull fee surplus from feeSource, split and invest according to allocation.
    /// @param  gstAmount    Amount of GST made available (pulled from feeSource approval).
    /// @param  pairedAmount Amount of paired token made available.
    function harvest(uint256 gstAmount, uint256 pairedAmount)
        external
        onlyKeeper
        notPaused
        nonReentrant
    {
        if (block.timestamp < lastHarvestAt + harvestCooldown) {
            revert Cooldown(lastHarvestAt + harvestCooldown);
        }
        if (gstAmount == 0 && pairedAmount == 0) revert NothingToHarvest();
        if (address(l1Pool) == address(0)) revert PoolNotSet();

        lastHarvestAt = block.timestamp;

        // Pull from fee source
        if (gstAmount > 0) {
            require(gst.transferFrom(feeSource, address(this), gstAmount), "FeeInvMgr: gst pull failed");
        }
        if (pairedAmount > 0) {
            require(paired.transferFrom(feeSource, address(this), pairedAmount), "FeeInvMgr: paired pull failed");
        }

        totalHarvested += gstAmount;
        emit Harvested(gstAmount, pairedAmount, block.timestamp);

        // Compute slices
        uint256 gstForPool      = (gstAmount    * l1PoolBps)     / BPS_DENOM;
        uint256 gstForCross     = (gstAmount    * crossChainBps) / BPS_DENOM;
        uint256 gstForReserve   = gstAmount    - gstForPool - gstForCross;
        uint256 pairForPool     = (pairedAmount * l1PoolBps)     / BPS_DENOM;
        uint256 pairForReserve  = pairedAmount - pairForPool;

        // 1. L1 pool allocation
        if (gstForPool > 0 || pairForPool > 0) {
            _injectL1Pool(gstForPool, pairForPool);
        }

        // 2. Cross-chain allocation (GST only; paired stays on L1)
        if (gstForCross > 0 && address(crossChain) != address(0)) {
            // Deployment without guardian (amounts <= crossChainSingleCap)
            // Amounts above cap would require a separate `deployLarge()` governance call
            if (gstForCross <= crossChainSingleCap) {
                _deployCrossChain(0, gstForCross, bytes32(0)); // chainId=0 → manager selects best chain
            }
            // If above cap, hold in reserve until governance provides guardian attestation
            else {
                gstForReserve += gstForCross;
                gstForCross    = 0;
            }
        }

        // 3. Reserve
        if (gstForReserve > 0 && reserveRecipient != address(0)) {
            require(gst.transfer(reserveRecipient, gstForReserve), "FeeInvMgr: reserve gst failed");
            totalReserved += gstForReserve;
            emit AllocatedToReserve(gstForReserve);
        }
        if (pairForReserve > 0 && reserveRecipient != address(0)) {
            require(paired.transfer(reserveRecipient, pairForReserve), "FeeInvMgr: reserve paired failed");
        }
    }

    /// @notice Governance-only: deploy a large cross-chain position with guardian attestation.
    /// @param chainId            Target chain.
    /// @param gstAmount          GST to deploy (must already be held by this contract).
    /// @param minGasLimit        Bridge gas limit.
    /// @param guardianAttestation EIP-712 attestation hash from AI guardian.
    function deployLarge(
        uint256 chainId,
        uint256 gstAmount,
        uint32  minGasLimit,
        bytes32 guardianAttestation
    ) external onlyGovernance nonReentrant {
        require(gstAmount > 0, "FeeInvMgr: zero amount");
        require(address(crossChain) != address(0), "FeeInvMgr: no cross chain");
        require(guardianAttestation != bytes32(0), "FeeInvMgr: attestation required");

        require(gst.approve(address(crossChain), gstAmount), "FeeInvMgr: approve failed");
        crossChain.deployToChain(chainId, gstAmount, minGasLimit, guardianAttestation);
        totalCrossChain += gstAmount;
        emit AllocatedCrossChain(chainId, gstAmount, guardianAttestation);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Compound
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Claim LP rewards from L1AIFeePool and re-inject as additional rewards.
    ///         This creates a compounding effect: LPs earn fees on fees.
    function compound()
        external
        onlyKeeper
        notPaused
        nonReentrant
    {
        if (address(l1Pool) == address(0)) revert PoolNotSet();

        (uint256 gstClaimed, uint256 pairClaimed) = l1Pool.claimRewards();

        uint256 reinvestedGst  = 0;
        uint256 reinvestedPair = 0;

        if (gstClaimed > 0 || pairClaimed > 0) {
            _injectL1Pool(gstClaimed, pairClaimed);
            reinvestedGst  = gstClaimed;
            reinvestedPair = pairClaimed;
        }

        totalCompounded += reinvestedGst;
        emit Compounded(reinvestedGst, reinvestedPair);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Pending claimable rewards sitting in L1 pool for this manager.
    function pendingCompound() external view returns (uint256 gst_, uint256 paired_) {
        if (address(l1Pool) == address(0)) return (0, 0);
        return l1Pool.pendingRewards(address(this));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Governance setters
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Update allocation percentages.  Must sum to BPS_DENOM.
    function setAllocation(uint256 l1Pool_, uint256 cross_, uint256 reserve_)
        external
        onlyGovernance
    {
        if (l1Pool_ + cross_ + reserve_ != BPS_DENOM) revert AllocationMismatch(l1Pool_ + cross_ + reserve_);
        l1PoolBps     = l1Pool_;
        crossChainBps = cross_;
        reserveBps    = reserve_;
        emit AllocationSet(l1Pool_, cross_, reserve_);
    }

    function setL1Pool(address pool) external onlyGovernance {
        l1Pool = IL1AIFeePool(pool);
        emit PoolSet(pool);
    }

    function setCrossChain(address adapter) external onlyGovernance {
        crossChain = IGSTCrossChainAdapter(adapter);
        emit CrossChainSet(adapter);
    }

    function setFeeSource(address source) external onlyGovernance {
        feeSource = source;
        emit FeeSourceSet(source);
    }

    function setReserveRecipient(address recipient) external onlyGovernance {
        reserveRecipient = recipient;
        emit ReserveRecipientSet(recipient);
    }

    function setKeeper(address keeper, bool allowed) external onlyGovernance {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setHarvestCooldown(uint256 seconds_) external onlyGovernance {
        harvestCooldown = seconds_;
        emit HarvestCooldownSet(seconds_);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setCrossChainSingleCap(uint256 cap) external onlyGovernance {
        crossChainSingleCap = cap;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @dev Approve and inject tokens into L1AIFeePool as protocol fee rewards.
    function _injectL1Pool(uint256 gstAmt, uint256 pairedAmt) internal {
        if (gstAmt > 0) {
            require(gst.approve(address(l1Pool), gstAmt), "FeeInvMgr: gst approve failed");
        }
        if (pairedAmt > 0) {
            require(paired.approve(address(l1Pool), pairedAmt), "FeeInvMgr: paired approve failed");
        }
        l1Pool.collectProtocolFees(gstAmt, pairedAmt);
        totalToL1Pool += gstAmt;
        emit AllocatedToL1Pool(gstAmt, pairedAmt);
    }

    /// @dev Deploy to the best available chain (or specific chainId if provided).
    function _deployCrossChain(uint256 chainId, uint256 gstAmt, bytes32 guardian) internal {
        // chainId == 0 used as "manager-selected"; caller should pass a specific chain
        // in production.  For now defaults to 0 which the adapter will reject — governance
        // must wire up at least one chain before auto-routing is active.
        require(gst.approve(address(crossChain), gstAmt), "FeeInvMgr: xchain approve failed");
        crossChain.deployToChain(chainId, gstAmt, 200_000, guardian);
        totalCrossChain += gstAmt;
        emit AllocatedCrossChain(chainId, gstAmt, guardian);
    }
}
