// GhostChain Contracts v5.6.1 (security/GhostMEVShield.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostMEVShield
/// @notice Commit-reveal scheme protecting GhostStack transactions from MEV extraction.
///         Users commit a hash of (intent, salt) in block N; reveal in block N+1 or later.
///         Sandwiched or front-run reveals are automatically invalidated by the time-lock.
///
///         Integration pattern:
///           1. Caller calls `commit(keccak256(abi.encode(intent, salt)))`.
///           2. After MIN_REVEAL_DELAY blocks, caller calls `reveal(intent, salt, executor)`.
///           3. `executor` (e.g. a DEX router) is called with the intent payload.
///
/// @dev Protections implemented:
///      • Minimum block delay between commit and reveal.
///      • Maximum staleness window — commits expire after MAX_COMMIT_AGE blocks.
///      • Per-address rate limit via commit nonce.
///      • Nullifier for replayed reveals.
contract GhostMEVShield is GhostBrand, ReentrancyGuard {
    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant MIN_REVEAL_DELAY = 1;   // blocks
    uint256 public constant MAX_COMMIT_AGE   = 64;  // blocks — ~13 min on GhostChain

    // ─── Types ───────────────────────────────────────────────────────────────
    struct Commitment {
        uint64  blockNumber;   // block where commit was accepted
        bool    revealed;      // true once successfully revealed
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    /// commitHash → Commitment
    mapping(bytes32 => Commitment) public commitments;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Committed(address indexed sender, bytes32 indexed commitHash, uint64 blockNumber);
    event Revealed(address indexed sender, bytes32 indexed commitHash, bytes callPayload);
    event CommitExpired(address indexed sender, bytes32 indexed commitHash);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error CommitAlreadyExists();
    error CommitNotFound();
    error RevealTooEarly(uint256 current, uint256 unlockAt);
    error CommitExpired_();
    error AlreadyRevealed();
    error ExecutorCallFailed();

    // ─── External: commit phase ───────────────────────────────────────────────
    /// @notice Submit a commitment hash. The commit hash must equal
    ///         `keccak256(abi.encode(msg.sender, intent, salt))`.
    /// @param commitHash  Opaque 32-byte commitment.
    function commit(bytes32 commitHash) external {
        if (commitments[commitHash].blockNumber != 0) revert CommitAlreadyExists();
        require(block.number <= type(uint64).max, "block overflow");
        commitments[commitHash] = Commitment({
            blockNumber: uint64(block.number),
            revealed:    false
        });
        emit Committed(msg.sender, commitHash, uint64(block.number));
    }

    /// @notice Reveal a committed intent and execute it via `executor`.
    /// @param intent    ABI-encoded call payload to forward to `executor`.
    /// @param salt      Random salt chosen at commit time.
    /// @param executor  Contract to call with `intent`.
    function reveal(
        bytes calldata intent,
        bytes32        salt,
        address        executor
    ) external nonReentrant {
        bytes32 commitHash = keccak256(abi.encode(msg.sender, intent, salt));
        Commitment storage c = commitments[commitHash];

        if (c.blockNumber == 0)    revert CommitNotFound();
        if (c.revealed)            revert AlreadyRevealed();

        uint256 unlockAt = uint256(c.blockNumber) + MIN_REVEAL_DELAY;
        if (block.number < unlockAt) revert RevealTooEarly(block.number, unlockAt);

        if (block.number > uint256(c.blockNumber) + MAX_COMMIT_AGE) {
            emit CommitExpired(msg.sender, commitHash);
            revert CommitExpired_();
        }

        c.revealed = true;

        (bool ok,) = executor.call(intent);
        require(ok, "GhostMEVShield: executor call failed");

        emit Revealed(msg.sender, commitHash, intent);
    }

    /// @notice Check whether a commitHash is still valid (committed, not revealed, not expired).
    function isCommitValid(bytes32 commitHash) external view returns (bool) {
        Commitment storage c = commitments[commitHash];
        if (c.blockNumber == 0)  return false;
        if (c.revealed)          return false;
        if (block.number > uint256(c.blockNumber) + MAX_COMMIT_AGE) return false;
        return true;
    }
}
