// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (l3/security/DefenderGuard.sol)
pragma solidity 0.8.24;

import {GhostBrand}   from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";

/**
 * @title  DefenderGuard
 * @notice On-chain enforcement layer for GhostBrain Defender AI.
 *
 *         Off-chain threat detection (TypeScript security modules) calls this
 *         contract through the GhostWallet admin key to:
 *          • Time-bound freeze an account (identified by bytes32 hash of user ID)
 *          • Permanently block a wallet address from platform contracts
 *
 *         Deployed exclusively on GhostL3 (chain_id 903).
 *         Constructor reverts on any other chain — ensures you cannot accidentally
 *         deploy on L1 or L2.
 *
 * @dev    All write functions are restricted to `onlyOwner`; the owner should be
 *         the GhostBrain Defender admin multi-sig.
 */
contract DefenderGuard is GhostBrand, GhostOwnable {

    // ── Errors ─────────────────────────────────────────────────────────────────

    error Defender__WrongChain(uint256 got, uint256 want);
    error Defender__ZeroAddress();
    error Defender__NotFrozen(bytes32 accountId);
    error Defender__AlreadyBlocked(address wallet);
    error Defender__NotBlocked(address wallet);
    error Defender__ZeroDuration();

    // ── Events ─────────────────────────────────────────────────────────────────

    event AccountFrozen(bytes32 indexed accountId, uint256 frozenUntil, string reason);
    event AccountUnfrozen(bytes32 indexed accountId);
    event WalletBlocked(address indexed wallet, string reason);
    event WalletUnblocked(address indexed wallet);

    // ── Storage ────────────────────────────────────────────────────────────────

    struct FreezeRecord {
        bool    active;
        uint48  frozenUntil; // unix timestamp (overflows year 281474)
        string  reason;
    }

    mapping(bytes32  => FreezeRecord)  private _freezeRecords;
    mapping(address  => bool)          private _blocked;
    mapping(address  => string)        private _blockReasons;

    uint256 public totalFreezes;
    uint256 public totalBlocks;

    // ── Constructor ────────────────────────────────────────────────────────────

    /**
     * @param admin  Owner address (GhostBrain Defender multi-sig).
     *               Must be non-zero.
     */
    constructor(address admin) GhostOwnable(admin) {
        if (block.chainid != L3_CHAIN_ID) {
            revert Defender__WrongChain(block.chainid, L3_CHAIN_ID);
        }
    }

    // ── Account freeze ────────────────────────────────────────────────────────

    /**
     * @notice Freeze an account for `durationSeconds`.
     * @param  accountId        keccak256 of the user ID string.
     * @param  durationSeconds  Freeze length. Must be > 0.
     * @param  reason           Human-readable reason string (stored on-chain).
     */
    function freezeAccount(
        bytes32        accountId,
        uint256        durationSeconds,
        string calldata reason
    ) external onlyOwner {
        if (durationSeconds == 0) revert Defender__ZeroDuration();

        uint48 until = uint48(block.timestamp + durationSeconds);
        _freezeRecords[accountId] = FreezeRecord({ active: true, frozenUntil: until, reason: reason });
        unchecked { ++totalFreezes; }
        emit AccountFrozen(accountId, until, reason);
    }

    /**
     * @notice Manually unfreeze an account before its natural expiry.
     * @param  accountId  Must currently have an active freeze record.
     */
    function unfreezeAccount(bytes32 accountId) external onlyOwner {
        if (!_freezeRecords[accountId].active) revert Defender__NotFrozen(accountId);
        _freezeRecords[accountId].active = false;
        emit AccountUnfrozen(accountId);
    }

    // ── Wallet block ──────────────────────────────────────────────────────────

    /**
     * @notice Permanently block a wallet address.
     * @param  wallet  Must be a non-zero address not already blocked.
     * @param  reason  Human-readable reason string.
     */
    function blockWallet(address wallet, string calldata reason) external onlyOwner {
        if (wallet == address(0))    revert Defender__ZeroAddress();
        if (_blocked[wallet])        revert Defender__AlreadyBlocked(wallet);

        _blocked[wallet]       = true;
        _blockReasons[wallet]  = reason;
        unchecked { ++totalBlocks; }
        emit WalletBlocked(wallet, reason);
    }

    /**
     * @notice Unblock a previously blocked wallet.
     * @param  wallet  Must currently be blocked.
     */
    function unblockWallet(address wallet) external onlyOwner {
        if (!_blocked[wallet]) revert Defender__NotBlocked(wallet);
        _blocked[wallet] = false;
        delete _blockReasons[wallet];
        emit WalletUnblocked(wallet);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /**
     * @notice Returns true if the account freeze is currently active (not expired).
     */
    function isAccountFrozen(bytes32 accountId) external view returns (bool) {
        FreezeRecord storage r = _freezeRecords[accountId];
        return r.active && block.timestamp < r.frozenUntil;
    }

    /**
     * @notice Returns true if the wallet is blocked.
     */
    function isWalletBlocked(address wallet) external view returns (bool) {
        return _blocked[wallet];
    }

    /**
     * @notice Returns full details of a freeze record.
     * @return active      Whether the freeze is still active and not expired.
     * @return frozenUntil Unix timestamp when the freeze expires.
     * @return reason      The reason string stored at freeze time.
     */
    function getFreezeRecord(bytes32 accountId)
        external view
        returns (bool active, uint48 frozenUntil, string memory reason)
    {
        FreezeRecord storage r = _freezeRecords[accountId];
        return (r.active && block.timestamp < r.frozenUntil, r.frozenUntil, r.reason);
    }

    /**
     * @notice Returns the block reason for a wallet (empty string if not blocked).
     */
    function getBlockReason(address wallet) external view returns (string memory) {
        return _blockReasons[wallet];
    }
}
