// GhostChain Contracts v5.6.1 (contracts/src/l3/economy/LeagueRegistry.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";

/// @title  LeagueRegistry
/// @notice On-chain record of seasonal league standings for LitVybzLive creators.
///         Stores creator tier (Bronze/Silver/Gold/Diamond/Legend) and season-end
///         promotions / relegations.  The off-chain `league_manager.ts` calls
///         `setStanding()` after each nightly recompute.
///
///         Seasons are opened/closed by admin.  A creator's current standing is
///         always readable on-chain by the GhostBrain governance layer.
contract LeagueRegistry is GhostBrand, GhostOwnable {
    // ── Errors ────────────────────────────────────────────────────────────────
    error League__WrongChain(uint256 expected, uint256 actual);
    error League__InvalidTier(uint8 tier);
    error League__SeasonNotOpen(bytes32 seasonId);
    error League__SeasonAlreadyClosed(bytes32 seasonId);
    error League__InvalidParams();
    error League__ZeroAddress();

    // ── Events ────────────────────────────────────────────────────────────────
    event SeasonOpened(bytes32 indexed seasonId, string name);
    event SeasonClosed(bytes32 indexed seasonId);
    event StandingSet(
        bytes32 indexed seasonId,
        address indexed creator,
        uint8   tier,
        uint32  rankInTier,
        uint256 score
    );
    event PromotionRelegation(
        bytes32 indexed seasonId,
        address indexed creator,
        bool    promoted,
        bool    relegated,
        uint8   newTier
    );

    // ── League tier constants ─────────────────────────────────────────────────
    uint8 public constant TIER_BRONZE  = 0;
    uint8 public constant TIER_SILVER  = 1;
    uint8 public constant TIER_GOLD    = 2;
    uint8 public constant TIER_DIAMOND = 3;
    uint8 public constant TIER_LEGEND  = 4;

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Season {
        string  name;
        uint256 startsAt;
        uint256 endsAt;
        bool    open;
    }

    struct Standing {
        uint8   tier;
        uint32  rankInTier;
        uint256 score;
        bool    promoted;
        bool    relegated;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    mapping(bytes32 => Season)                          public seasons;
    mapping(bytes32 => mapping(address => Standing))    public standings;
    bytes32[]                                           private _seasonIds;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _admin) GhostOwnable(_admin) {
        if (_admin == address(0)) revert League__ZeroAddress();
    }

    // ── Season management ─────────────────────────────────────────────────────

    /// @notice Open a new season.
    function openSeason(
        bytes32         seasonId,
        string calldata name,
        uint256         startsAt,
        uint256         endsAt
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert League__WrongChain(L3_CHAIN_ID, block.chainid);
        if (bytes(name).length == 0 || endsAt <= startsAt) revert League__InvalidParams();
        if (seasons[seasonId].startsAt != 0) revert League__SeasonAlreadyClosed(seasonId);

        seasons[seasonId] = Season({ name: name, startsAt: startsAt, endsAt: endsAt, open: true });
        _seasonIds.push(seasonId);
        emit SeasonOpened(seasonId, name);
    }

    /// @notice Close a season, preventing further standing updates.
    function closeSeason(bytes32 seasonId) external onlyOwner {
        if (!seasons[seasonId].open) revert League__SeasonAlreadyClosed(seasonId);
        seasons[seasonId].open = false;
        emit SeasonClosed(seasonId);
    }

    // ── Standing updates ──────────────────────────────────────────────────────

    /// @notice Set a creator's standing for the current season.
    ///         Called nightly by the platform controller after metric recompute.
    function setStanding(
        bytes32 seasonId,
        address creator,
        uint8   tier,
        uint32  rankInTier,
        uint256 score
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert League__WrongChain(L3_CHAIN_ID, block.chainid);
        if (!seasons[seasonId].open)       revert League__SeasonNotOpen(seasonId);
        if (creator == address(0))         revert League__ZeroAddress();
        if (tier > TIER_LEGEND)            revert League__InvalidTier(tier);

        standings[seasonId][creator] = Standing({
            tier:        tier,
            rankInTier:  rankInTier,
            score:       score,
            promoted:    false,
            relegated:   false
        });

        emit StandingSet(seasonId, creator, tier, rankInTier, score);
    }

    /// @notice Record promotion or relegation for season-end.
    function applyPromotionRelegation(
        bytes32 seasonId,
        address creator,
        bool    promoted,
        bool    relegated,
        uint8   newTier
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert League__WrongChain(L3_CHAIN_ID, block.chainid);
        if (creator == address(0)) revert League__ZeroAddress();
        if (newTier > TIER_LEGEND) revert League__InvalidTier(newTier);

        Standing storage s = standings[seasonId][creator];
        s.tier      = newTier;
        s.promoted  = promoted;
        s.relegated = relegated;

        emit PromotionRelegation(seasonId, creator, promoted, relegated, newTier);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getStanding(bytes32 seasonId, address creator) external view returns (Standing memory) {
        return standings[seasonId][creator];
    }

    function activeSeasonId() external view returns (bytes32) {
        if (_seasonIds.length == 0) return bytes32(0);
        // Most recently opened season
        return _seasonIds[_seasonIds.length - 1];
    }

    function totalSeasons() external view returns (uint256) {
        return _seasonIds.length;
    }
}
