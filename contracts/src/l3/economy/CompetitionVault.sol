// GhostChain Contracts v5.6.1 (contracts/src/l3/economy/CompetitionVault.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";

/// @title  CompetitionVault
/// @notice Holds GST prize pools for LitVybzLive competitions and distributes
///         prizes to ranked winners after admin calls `awardPrize()` / `batchAwardPrizes()`.
///
///         Prize split (matched by off-chain `competition_engine.ts`):
///           • 1st place  → 50 %
///           • 2nd place  → 25 %
///           • 3rd place  → 12.5 %
///           • Remainder  → split equally among all other winners
///
///         Admin funds each vault via `createVault()` which pulls GST from the
///         platform treasury via ERC-20 `transferFrom`.
contract CompetitionVault is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error Vault__WrongChain(uint256 expected, uint256 actual);
    error Vault__VaultAlreadyExists(bytes32 competitionId);
    error Vault__VaultNotFound(bytes32 competitionId);
    error Vault__AlreadyAwarded(bytes32 competitionId, address winner);
    error Vault__InsufficientBalance(bytes32 competitionId, uint256 requested, uint256 available);
    error Vault__LengthMismatch();
    error Vault__ZeroAddress();
    error Vault__ZeroAmount();
    error Vault__TransferFailed();
    error Vault__CompetitionCancelled(bytes32 competitionId);

    // ── Events ────────────────────────────────────────────────────────────────
    event VaultCreated(bytes32 indexed competitionId, uint256 prizePool);
    event PrizeAwarded(bytes32 indexed competitionId, address indexed winner, uint256 amount);
    event PrizeRefunded(bytes32 indexed competitionId, address indexed treasury, uint256 amount);

    // ── State ─────────────────────────────────────────────────────────────────
    IGRC20 public immutable GST;

    struct Vault {
        uint256 balance;
        uint256 awarded;
        bool    cancelled;
    }

    mapping(bytes32 => Vault)                          private _vaults;
    mapping(bytes32 => mapping(address => uint256))    public  prizeAwarded;
    mapping(bytes32 => bool)                           private _exists;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _gst, address _admin) GhostOwnable(_admin) {
        if (_gst == address(0) || _admin == address(0)) revert Vault__ZeroAddress();
        GST = IGRC20(_gst);
    }

    // ── Vault lifecycle ───────────────────────────────────────────────────────

    /// @notice Fund a new competition vault by pulling GST from `msg.sender`.
    ///         Caller must have approved this contract for `prizePool` GST.
    function createVault(bytes32 competitionId, uint256 prizePool) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert Vault__WrongChain(L3_CHAIN_ID, block.chainid);
        if (_exists[competitionId])        revert Vault__VaultAlreadyExists(competitionId);
        if (prizePool == 0)                revert Vault__ZeroAmount();

        _exists[competitionId] = true;
        _vaults[competitionId] = Vault({ balance: prizePool, awarded: 0, cancelled: false });

        bool ok = GST.transferFrom(msg.sender, address(this), prizePool);
        require(ok, "Vault: GST pull failed");

        emit VaultCreated(competitionId, prizePool);
    }

    /// @notice Award a single prize to a winner.  Nonreentrant.
    function awardPrize(
        bytes32 competitionId,
        address winner,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Vault__WrongChain(L3_CHAIN_ID, block.chainid);
        _assertActive(competitionId);
        if (winner == address(0)) revert Vault__ZeroAddress();
        if (amount == 0)          revert Vault__ZeroAmount();
        if (prizeAwarded[competitionId][winner] != 0)
            revert Vault__AlreadyAwarded(competitionId, winner);

        Vault storage v = _vaults[competitionId];
        uint256 available = v.balance - v.awarded;
        if (amount > available) revert Vault__InsufficientBalance(competitionId, amount, available);

        v.awarded                           += amount;
        prizeAwarded[competitionId][winner] = amount;

        bool ok = GST.transfer(winner, amount);
        require(ok, "Vault: GST transfer failed");

        emit PrizeAwarded(competitionId, winner, amount);
    }

    /// @notice Award prizes to multiple winners in one call.  Nonreentrant.
    function batchAwardPrizes(
        bytes32         competitionId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Vault__WrongChain(L3_CHAIN_ID, block.chainid);
        if (winners.length != amounts.length) revert Vault__LengthMismatch();
        _assertActive(competitionId);

        Vault storage v = _vaults[competitionId];

        uint256 totalAmount;
        for (uint256 i = 0; i < amounts.length; ++i) {
            totalAmount += amounts[i];
        }
        uint256 available = v.balance - v.awarded;
        if (totalAmount > available)
            revert Vault__InsufficientBalance(competitionId, totalAmount, available);

        v.awarded += totalAmount;

        for (uint256 i = 0; i < winners.length; ++i) {
            if (winners[i] == address(0)) revert Vault__ZeroAddress();
            if (amounts[i] == 0)          revert Vault__ZeroAmount();
            if (prizeAwarded[competitionId][winners[i]] != 0)
                revert Vault__AlreadyAwarded(competitionId, winners[i]);

            prizeAwarded[competitionId][winners[i]] = amounts[i];
            bool ok = GST.transfer(winners[i], amounts[i]);
            require(ok, "Vault: GST transfer failed");
            emit PrizeAwarded(competitionId, winners[i], amounts[i]);
        }
    }

    /// @notice Refund the remaining pool to `treasury` (e.g., competition cancelled).
    function refund(
        bytes32 competitionId,
        address treasury
    ) external onlyOwner nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Vault__WrongChain(L3_CHAIN_ID, block.chainid);
        if (!_exists[competitionId]) revert Vault__VaultNotFound(competitionId);
        if (treasury == address(0)) revert Vault__ZeroAddress();

        Vault storage v = _vaults[competitionId];
        uint256 remaining = v.balance - v.awarded;
        require(remaining > 0, "Vault: nothing to refund");

        v.cancelled   = true;
        v.awarded     = v.balance; // Mark fully settled

        bool ok = GST.transfer(treasury, remaining);
        require(ok, "Vault: refund transfer failed");

        emit PrizeRefunded(competitionId, treasury, remaining);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function vaultBalance(bytes32 competitionId) external view returns (uint256) {
        return _vaults[competitionId].balance - _vaults[competitionId].awarded;
    }

    function vaultInfo(bytes32 competitionId) external view
        returns (uint256 balance, uint256 awarded, bool cancelled)
    {
        Vault storage v = _vaults[competitionId];
        return (v.balance, v.awarded, v.cancelled);
    }

    function vaultExists(bytes32 competitionId) external view returns (bool) {
        return _exists[competitionId];
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _assertActive(bytes32 competitionId) internal view {
        if (!_exists[competitionId])           revert Vault__VaultNotFound(competitionId);
        if (_vaults[competitionId].cancelled)  revert Vault__CompetitionCancelled(competitionId);
    }
}
