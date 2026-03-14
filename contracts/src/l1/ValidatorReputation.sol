// GhostChain Contracts v5.6.1 (l1/ValidatorReputation.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title ValidatorReputation
/// @notice On-chain validator reputation scoring engine for GhostChain L1.
///
///         Score model:
///           • Each validator starts at INITIAL_SCORE (500/1000).
///           • Score increases for: block proposal, attestation participation.
///           • Score decreases for: missed blocks, double-sign slashing, downtime.
///           • Score decays toward DECAY_TARGET over time if inactive.
///           • Score is clamped to [0, MAX_SCORE].
///           • Validators below JAILING_THRESHOLD are quarantined from consensus.
///
///         Integration:
///           • `SlashingManager` calls `applySlashPenalty` on slash events.
///           • `ValidatorRegistry` calls `recordProposal` / `recordAttestation` each epoch.
///           • GhostBrain AI reads scores for weighting in consensus scheduling.
contract ValidatorReputation is GhostBrand {
    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant MAX_SCORE           = 1_000;
    uint256 public constant INITIAL_SCORE       = 500;
    uint256 public constant JAILING_THRESHOLD   = 100;   // below this → jailed
    uint256 public constant DECAY_TARGET        = 400;   // idle score decays toward this
    uint256 public constant DECAY_RATE_PER_EPOCH= 5;     // points lost per idle epoch
    uint256 public constant PROPOSAL_REWARD     = 10;    // points gained per block proposed
    uint256 public constant ATTESTATION_REWARD  = 2;     // points per attestation
    uint256 public constant MISSED_BLOCK_PENALTY= 15;    // points lost per missed block
    uint256 public constant DOWNTIME_PENALTY    = 50;    // points lost per downtime event
    uint256 public constant DOUBLE_SIGN_PENALTY = 300;   // points lost per double-sign

    // ─── Types ───────────────────────────────────────────────────────────────
    struct ValidatorRecord {
        uint256 score;
        uint64  lastActiveEpoch;
        uint64  totalProposals;
        uint64  totalAttestations;
        uint64  totalMissedBlocks;
        bool    jailed;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    mapping(address => ValidatorRecord) public records;

    address public immutable SLASHING_MANAGER;
    address public immutable VALIDATOR_REGISTRY;
    address public           GOVERNANCE;

    uint64 public currentEpoch;

    // ─── Events ──────────────────────────────────────────────────────────────
    event ScoreUpdated(address indexed validator, uint256 oldScore, uint256 newScore, string reason);
    event ValidatorJailed(address indexed validator, uint256 score);
    event ValidatorUnjailed(address indexed validator);
    event EpochAdvanced(uint64 indexed epoch);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error Unauthorized();
    error ValidatorAlreadyJailed();
    error ValidatorNotJailed();
    error NotGovernance();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyRegistry() {
        _onlyRegistry();
        _;
    }
    modifier onlySlasher() {
        _onlySlasher();
        _;
    }
    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _onlyRegistry() internal view {
        if (msg.sender != VALIDATOR_REGISTRY) revert Unauthorized();
    }
    function _onlySlasher() internal view {
        if (msg.sender != SLASHING_MANAGER) revert Unauthorized();
    }
    function _onlyGovernance() internal view {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address slashingManager_,
        address validatorRegistry_,
        address governance_
    ) {
        require(slashingManager_   != address(0), "slasher=0");
        require(validatorRegistry_ != address(0), "registry=0");
        require(governance_        != address(0), "gov=0");
        SLASHING_MANAGER   = slashingManager_;
        VALIDATOR_REGISTRY = validatorRegistry_;
        GOVERNANCE         = governance_;
    }

    // ─── Registry callbacks ───────────────────────────────────────────────────
    /// @notice Called when a validator successfully proposes a block.
    function recordProposal(address validator) external onlyRegistry {
        _ensureInitialized(validator);
        ValidatorRecord storage r = records[validator];
        if (r.jailed) return;   // jailed validators don't earn points
        _applyDecay(validator);
        uint256 old = r.score;
        r.score = _clamp(r.score + PROPOSAL_REWARD);
        r.totalProposals++;
        require(block.number <= type(uint64).max, "block overflow");
        r.lastActiveEpoch = currentEpoch;
        emit ScoreUpdated(validator, old, r.score, "proposal");
    }

    /// @notice Called when a validator attests to a block.
    function recordAttestation(address validator) external onlyRegistry {
        _ensureInitialized(validator);
        ValidatorRecord storage r = records[validator];
        if (r.jailed) return;
        _applyDecay(validator);
        uint256 old = r.score;
        r.score = _clamp(r.score + ATTESTATION_REWARD);
        r.totalAttestations++;
        r.lastActiveEpoch = currentEpoch;
        emit ScoreUpdated(validator, old, r.score, "attestation");
    }

    /// @notice Called when a validator misses a scheduled block proposal.
    function recordMissedBlock(address validator) external onlyRegistry {
        _ensureInitialized(validator);
        ValidatorRecord storage r = records[validator];
        _applyDecay(validator);
        uint256 old = r.score;
        r.score = r.score > MISSED_BLOCK_PENALTY ? r.score - MISSED_BLOCK_PENALTY : 0;
        r.totalMissedBlocks++;
        emit ScoreUpdated(validator, old, r.score, "missed_block");
        _checkJail(validator);
    }

    // ─── Slasher callbacks ────────────────────────────────────────────────────
    /// @notice Apply slash penalty (double-sign or downtime).
    /// @param validator  The offending validator.
    /// @param penaltyType 0 = double-sign, 1 = downtime
    function applySlashPenalty(address validator, uint8 penaltyType) external onlySlasher {
        _ensureInitialized(validator);
        ValidatorRecord storage r = records[validator];
        uint256 penalty = (penaltyType == 0) ? DOUBLE_SIGN_PENALTY : DOWNTIME_PENALTY;
        uint256 old = r.score;
        r.score = r.score > penalty ? r.score - penalty : 0;
        string memory reason = (penaltyType == 0) ? "double_sign" : "downtime";
        emit ScoreUpdated(validator, old, r.score, reason);
        _checkJail(validator);
    }

    // ─── Governance: epoch + unjail ───────────────────────────────────────────
    /// @notice Advance the global epoch counter (called by consensus layer each epoch).
    function advanceEpoch() external onlyGovernance {
        currentEpoch++;
        emit EpochAdvanced(currentEpoch);
    }

    /// @notice Unjail a validator after they have met remediation conditions.
    function unjail(address validator) external onlyGovernance {
        ValidatorRecord storage r = records[validator];
        if (!r.jailed) revert ValidatorNotJailed();
        r.jailed = false;
        // Set score back to jailing threshold so they must earn their way up
        if (r.score < JAILING_THRESHOLD) r.score = JAILING_THRESHOLD;
        emit ValidatorUnjailed(validator);
    }

    // ─── View ─────────────────────────────────────────────────────────────────
    /// @notice Return whether a validator is eligible for consensus participation.
    function isEligible(address validator) external view returns (bool) {
        ValidatorRecord storage r = records[validator];
        return !r.jailed && r.score >= JAILING_THRESHOLD;
    }

    /// @notice Return a validator's current reputation score.
    function scoreOf(address validator) external view returns (uint256) {
        return records[validator].score;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────
    function _ensureInitialized(address validator) internal {
        if (records[validator].score == 0 && !records[validator].jailed) {
            records[validator].score = INITIAL_SCORE;
            records[validator].lastActiveEpoch = currentEpoch;
        }
    }

    function _applyDecay(address validator) internal {
        ValidatorRecord storage r = records[validator];
        uint64 idle = currentEpoch > r.lastActiveEpoch
            ? currentEpoch - r.lastActiveEpoch
            : 0;
        if (idle == 0 || r.score <= DECAY_TARGET) return;
        uint256 decay = uint256(idle) * DECAY_RATE_PER_EPOCH;
        uint256 decayFloor = r.score > DECAY_TARGET ? r.score - DECAY_TARGET : 0;
        decay = decay < decayFloor ? decay : decayFloor;
        r.score -= decay;
    }

    function _checkJail(address validator) internal {
        ValidatorRecord storage r = records[validator];
        if (!r.jailed && r.score < JAILING_THRESHOLD) {
            r.jailed = true;
            emit ValidatorJailed(validator, r.score);
        }
    }

    function _clamp(uint256 score) internal pure returns (uint256) {
        return score > MAX_SCORE ? MAX_SCORE : score;
    }
}
