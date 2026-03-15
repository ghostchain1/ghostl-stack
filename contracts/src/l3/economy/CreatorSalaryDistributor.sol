// GhostChain Contracts v5.6.1 (contracts/src/l3/economy/CreatorSalaryDistributor.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";

/// @title  CreatorSalaryDistributor
/// @notice Distributes monthly GST salaries to tiered creators on GhostL3.
///         The platform controller opens a cycle, queues payouts, then calls
///         `distribute()` which releases GST to each creator wallet.
///
///         Tier salaries (GST, 18-decimal):
///           Bronze  — 1,000 GST/month
///           Silver  — 5,000 GST/month
///           Gold    — 15,000 GST/month
///           Elite   — 50,000 GST/month
///
///         The contract must hold enough GST before a cycle can be closed.
contract CreatorSalaryDistributor is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error Salary__WrongChain(uint256 expected, uint256 actual);
    error Salary__ZeroAddress();
    error Salary__InvalidTier(uint8 tier);
    error Salary__CycleNotOpen(bytes32 cycleId);
    error Salary__CycleClosed(bytes32 cycleId);
    error Salary__AlreadyPaid(bytes32 cycleId, address creator);
    error Salary__InsufficientReserve(uint256 required, uint256 available);
    error Salary__InvalidParams();

    // ── Events ────────────────────────────────────────────────────────────────
    event CycleOpened(bytes32 indexed cycleId, string periodLabel, uint256 reservedGst);
    event SalaryPaid(
        bytes32 indexed cycleId,
        address indexed creator,
        uint8   tier,
        uint256 amountGst
    );
    event CycleClosed(bytes32 indexed cycleId, uint256 totalPaid, uint256 creatorCount);
    event GstDeposited(address indexed from, uint256 amount);

    // ── Tier constants (18-decimal GST) ───────────────────────────────────────
    uint8  public constant TIER_BRONZE = 0;
    uint8  public constant TIER_SILVER = 1;
    uint8  public constant TIER_GOLD   = 2;
    uint8  public constant TIER_ELITE  = 3;

    uint256 public constant SALARY_BRONZE =  1_000e18;
    uint256 public constant SALARY_SILVER =  5_000e18;
    uint256 public constant SALARY_GOLD   = 15_000e18;
    uint256 public constant SALARY_ELITE  = 50_000e18;

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Cycle {
        string  periodLabel;   // e.g. "2026-03"
        uint256 reservedGst;
        uint256 paidGst;
        uint256 creatorCount;
        bool    open;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IGRC20 public immutable GST;

    mapping(bytes32 => Cycle)                         public cycles;
    mapping(bytes32 => mapping(address => bool))      public paid;   // cycleId → creator → paid
    mapping(bytes32 => mapping(address => uint256))   public payouts; // cycleId → creator → amount

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _gst, address _admin) GhostOwnable(_admin) {
        if (_gst   == address(0)) revert Salary__ZeroAddress();
        if (_admin == address(0)) revert Salary__ZeroAddress();
        GST = IGRC20(_gst);
    }

    // ── Admin: cycle management ───────────────────────────────────────────────

    /// @notice Open a new salary cycle and reserve GST from the contract balance.
    /// @param cycleId     Unique identifier (keccak256 of periodLabel recommended)
    /// @param periodLabel Human-readable label (e.g. "2026-03")
    /// @param reserveGst  Amount of GST to reserve for this cycle
    function openCycle(
        bytes32        cycleId,
        string calldata periodLabel,
        uint256         reserveGst
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert Salary__WrongChain(L3_CHAIN_ID, block.chainid);
        if (cycles[cycleId].open)         revert Salary__CycleNotOpen(cycleId);
        if (bytes(periodLabel).length == 0) revert Salary__InvalidParams();

        uint256 bal = GST.balanceOf(address(this));
        if (bal < reserveGst) revert Salary__InsufficientReserve(reserveGst, bal);

        cycles[cycleId] = Cycle({
            periodLabel:  periodLabel,
            reservedGst:  reserveGst,
            paidGst:      0,
            creatorCount: 0,
            open:         true
        });

        emit CycleOpened(cycleId, periodLabel, reserveGst);
    }

    /// @notice Pay one creator their salary for this cycle.
    ///         Caller must be the owner (platform controller).
    function distribute(
        bytes32 cycleId,
        address creator,
        uint8   tier
    ) external onlyOwner nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Salary__WrongChain(L3_CHAIN_ID, block.chainid);
        if (!cycles[cycleId].open)        revert Salary__CycleClosed(cycleId);
        if (creator == address(0))        revert Salary__ZeroAddress();
        if (paid[cycleId][creator])       revert Salary__AlreadyPaid(cycleId, creator);

        uint256 salary = _salaryForTier(tier);
        Cycle storage c = cycles[cycleId];

        if (c.paidGst + salary > c.reservedGst)
            revert Salary__InsufficientReserve(salary, c.reservedGst - c.paidGst);

        paid[cycleId][creator]    = true;
        payouts[cycleId][creator] = salary;
        c.paidGst      += salary;
        c.creatorCount += 1;

        require(GST.transfer(creator, salary), "Salary: GST transfer failed");
        emit SalaryPaid(cycleId, creator, tier, salary);
    }

    /// @notice Batch-distribute to multiple creators in one tx.
    function distributeBatch(
        bytes32          cycleId,
        address[] calldata creators,
        uint8[]   calldata tiers
    ) external onlyOwner nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Salary__WrongChain(L3_CHAIN_ID, block.chainid);
        if (!cycles[cycleId].open)        revert Salary__CycleClosed(cycleId);
        if (creators.length != tiers.length || creators.length == 0) revert Salary__InvalidParams();

        Cycle storage c = cycles[cycleId];
        for (uint256 i = 0; i < creators.length; ) {
            address creator = creators[i];
            uint8   tier    = tiers[i];

            if (creator == address(0) || paid[cycleId][creator]) {
                unchecked { ++i; }
                continue;
            }

            uint256 salary = _salaryForTier(tier);
            if (c.paidGst + salary > c.reservedGst) {
                unchecked { ++i; }
                continue;
            }

            paid[cycleId][creator]    = true;
            payouts[cycleId][creator] = salary;
            c.paidGst      += salary;
            c.creatorCount += 1;

            require(GST.transfer(creator, salary), "Salary: GST transfer failed");
            emit SalaryPaid(cycleId, creator, tier, salary);

            unchecked { ++i; }
        }
    }

    /// @notice Close a cycle after all payouts are done.
    function closeCycle(bytes32 cycleId) external onlyOwner {
        if (!cycles[cycleId].open) revert Salary__CycleClosed(cycleId);
        cycles[cycleId].open = false;
        Cycle memory c = cycles[cycleId];
        emit CycleClosed(cycleId, c.paidGst, c.creatorCount);
    }

    // ── Deposit helper ────────────────────────────────────────────────────────

    /// @notice Admin deposits GST into the contract to fund salary payouts.
    function deposit(uint256 amount) external onlyOwner {
        require(GST.transferFrom(msg.sender, address(this), amount), "Salary: deposit failed");
        emit GstDeposited(msg.sender, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function salaryForTier(uint8 tier) external pure returns (uint256) {
        return _salaryForTier(tier);
    }

    function gstBalance() external view returns (uint256) {
        return GST.balanceOf(address(this));
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _salaryForTier(uint8 tier) internal pure returns (uint256) {
        if (tier == TIER_BRONZE) return SALARY_BRONZE;
        if (tier == TIER_SILVER) return SALARY_SILVER;
        if (tier == TIER_GOLD)   return SALARY_GOLD;
        if (tier == TIER_ELITE)  return SALARY_ELITE;
        revert Salary__InvalidTier(tier);
    }
}
