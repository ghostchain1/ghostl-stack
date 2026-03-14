// GhostChain Contracts v5.6.1 (gid/contracts/ReputationEngine.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title ReputationEngine
 * @notice Multi-dimensional on-chain reputation scoring for GhostChain identities.
 *
 * Scoring categories:
 *   GOVERNANCE   — participation in GhostChainGovernor proposals and ratification
 *   VALIDATOR    — validator uptime, correct attestations, slashing history
 *   BRIDGE       — successful bridge operations, no fraud alerts
 *   COMMUNITY    — social vouching, LGE participation, GNS usage
 *
 * Weights are governable — use `setWeight()` through admin (intended to be
 * the GhostChainGovernor) to adjust over time.
 *
 * Score model:
 *   - Per-address per-category `uint256` score, zero-floored.
 *   - `totalScore(address)` returns the weighted sum, capped at MAX_TOTAL.
 *   - Authorised scorers (validators, bridge, governance contracts) call
 *     `increase()` / `decrease()`.
 *   - All mutations are advisory-visible: ReputationUpdated events let
 *     GhostBrain oracle and the GID off-chain layer respond in real time.
 *
 * Security:
 *   - Only allowlisted `scorers` may mutate scores.
 *   - Admin may add/remove scorers (admin = GhostChainGovernor post-deploy).
 *   - Scores are floored at 0 on decrease (no underflow via unchecked path).
 *   - Total score capped at MAX_TOTAL (1e9) per address.
 *   - No external calls; no reentrancy risk.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */
contract ReputationEngine {
    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;

    // ─── Scoring Config ───────────────────────────────────────────────────────

    uint256 public constant MAX_SCORE_PER_CATEGORY = 250_000_000; // 250 M each
    uint256 public constant MAX_TOTAL               = 1_000_000_000; // 1 B
    uint256 public constant WEIGHT_DENOMINATOR      = 100;

    // Category indices — use enum for type safety.
    enum ScoreCategory { GOVERNANCE, VALIDATOR, BRIDGE, COMMUNITY }

    uint256 private constant NUM_CATEGORIES = 4;

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;

    /// @notice Address → category → score.
    mapping(address => mapping(ScoreCategory => uint256)) private _scores;

    /// @notice Category weights (out of WEIGHT_DENOMINATOR = 100).
    ///         Governance=30, Validator=30, Bridge=20, Community=20 at deploy.
    mapping(ScoreCategory => uint256) public weights;

    /// @notice Authorised scorers (validator contracts, bridge, governance).
    mapping(address => bool) public scorers;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ScoreIncreased(
        address indexed subject,
        ScoreCategory indexed category,
        uint256 amount,
        uint256 newScore,
        address indexed scorer
    );
    event ScoreDecreased(
        address indexed subject,
        ScoreCategory indexed category,
        uint256 amount,
        uint256 newScore,
        address indexed scorer
    );
    event WeightUpdated(ScoreCategory indexed category, uint256 newWeight);
    event ScorerAdded(address indexed scorer);
    event ScorerRemoved(address indexed scorer);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotScorer();
    error ZeroAddress();
    error ZeroAmount();
    error WeightOutOfRange();
    error TotalWeightMismatch(uint256 actual);
    error ScoreCategoryInvalid();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    modifier onlyScorer() {
        _onlyScorer();
        _;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    function _onlyScorer() internal view {
        if (!scorers[msg.sender]) revert NotScorer();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;

        // Default weights — must sum to WEIGHT_DENOMINATOR.
        weights[ScoreCategory.GOVERNANCE] = 30;
        weights[ScoreCategory.VALIDATOR]  = 30;
        weights[ScoreCategory.BRIDGE]     = 20;
        weights[ScoreCategory.COMMUNITY]  = 20;

        scorers[msg.sender] = true;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function addScorer(address scorer) external onlyAdmin {
        if (scorer == address(0)) revert ZeroAddress();
        scorers[scorer] = true;
        emit ScorerAdded(scorer);
    }

    function removeScorer(address scorer) external onlyAdmin {
        scorers[scorer] = false;
        emit ScorerRemoved(scorer);
    }

    /**
     * @notice Update category weights.
     *         All four weights must be provided and must sum to WEIGHT_DENOMINATOR.
     */
    function setWeights(
        uint256 govWeight,
        uint256 valWeight,
        uint256 bridgeWeight,
        uint256 communityWeight
    ) external onlyAdmin {
        uint256 total = govWeight + valWeight + bridgeWeight + communityWeight;
        if (total != WEIGHT_DENOMINATOR) revert TotalWeightMismatch(total);

        weights[ScoreCategory.GOVERNANCE] = govWeight;
        weights[ScoreCategory.VALIDATOR]  = valWeight;
        weights[ScoreCategory.BRIDGE]     = bridgeWeight;
        weights[ScoreCategory.COMMUNITY]  = communityWeight;

        emit WeightUpdated(ScoreCategory.GOVERNANCE, govWeight);
        emit WeightUpdated(ScoreCategory.VALIDATOR,  valWeight);
        emit WeightUpdated(ScoreCategory.BRIDGE,     bridgeWeight);
        emit WeightUpdated(ScoreCategory.COMMUNITY,  communityWeight);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        address old = admin;
        admin = newAdmin;
        emit AdminTransferred(old, newAdmin);
    }

    // ─── Score Mutations ──────────────────────────────────────────────────────

    /**
     * @notice Increase `subject`'s score in `category` by `amount`.
     *         Capped at MAX_SCORE_PER_CATEGORY per category.
     */
    function increase(address subject, ScoreCategory category, uint256 amount) external onlyScorer {
        if (subject == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 current = _scores[subject][category];
        uint256 newScore;

        unchecked {
            newScore = current + amount;
        }
        if (newScore < current) {
            // Overflow: clamp to max.
            newScore = MAX_SCORE_PER_CATEGORY;
        } else if (newScore > MAX_SCORE_PER_CATEGORY) {
            newScore = MAX_SCORE_PER_CATEGORY;
        }

        _scores[subject][category] = newScore;
        emit ScoreIncreased(subject, category, amount, newScore, msg.sender);
    }

    /**
     * @notice Decrease `subject`'s score in `category` by `amount`, floored at 0.
     */
    function decrease(address subject, ScoreCategory category, uint256 amount) external onlyScorer {
        if (subject == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 current = _scores[subject][category];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[subject][category] = newScore;

        emit ScoreDecreased(subject, category, amount, newScore, msg.sender);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Raw score in a single category.
    function scoreOf(address subject, ScoreCategory category) external view returns (uint256) {
        return _scores[subject][category];
    }

    /// @notice All four category scores: [GOVERNANCE, VALIDATOR, BRIDGE, COMMUNITY].
    function allScoresOf(address subject)
        external
        view
        returns (uint256[4] memory out)
    {
        out[0] = _scores[subject][ScoreCategory.GOVERNANCE];
        out[1] = _scores[subject][ScoreCategory.VALIDATOR];
        out[2] = _scores[subject][ScoreCategory.BRIDGE];
        out[3] = _scores[subject][ScoreCategory.COMMUNITY];
    }

    /**
     * @notice Weighted total score, capped at MAX_TOTAL.
     * @dev    Uses integer arithmetic: score × weight / 100.
     */
    function totalScore(address subject) external view returns (uint256) {
        uint256 weighted;

        weighted += (_scores[subject][ScoreCategory.GOVERNANCE] * weights[ScoreCategory.GOVERNANCE]);
        weighted += (_scores[subject][ScoreCategory.VALIDATOR]  * weights[ScoreCategory.VALIDATOR]);
        weighted += (_scores[subject][ScoreCategory.BRIDGE]     * weights[ScoreCategory.BRIDGE]);
        weighted += (_scores[subject][ScoreCategory.COMMUNITY]  * weights[ScoreCategory.COMMUNITY]);

        uint256 result = weighted / WEIGHT_DENOMINATOR;
        return result > MAX_TOTAL ? MAX_TOTAL : result;
    }

    /**
     * @notice Total weight check (invariant: should always equal 100).
     */
    function totalWeight() external view returns (uint256) {
        return weights[ScoreCategory.GOVERNANCE]
             + weights[ScoreCategory.VALIDATOR]
             + weights[ScoreCategory.BRIDGE]
             + weights[ScoreCategory.COMMUNITY];
    }
}
