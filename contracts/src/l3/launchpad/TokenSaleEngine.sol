// GhostChain Contracts v5.6.1 (contracts/src/l3/launchpad/TokenSaleEngine.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";
import {CreatorToken} from "./CreatorToken.sol";

/// @title  TokenSaleEngine
/// @notice Manages public fan-token sales on GhostL3.
///         Fans pay GST → engine mints fan tokens → GST accumulates in per-sale
///         proceeds buckets → creator claims GST after sale ends.
///
///         The engine is set as the `minter` on each CreatorToken, so only this
///         contract can issue new tokens during an active sale.
contract TokenSaleEngine is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error Sale__WrongChain(uint256 expected, uint256 actual);
    error Sale__NotCreator();
    error Sale__AlreadyExists(bytes32 saleId);
    error Sale__NotFound(bytes32 saleId);
    error Sale__NotStarted(bytes32 saleId);
    error Sale__Ended(bytes32 saleId);
    error Sale__NotEnded(bytes32 saleId);
    error Sale__HardCapReached(bytes32 saleId);
    error Sale__ZeroAmount();
    error Sale__InvalidParams();
    error Sale__NothingToClaim();
    error Sale__TransferFailed();

    // ── Events ────────────────────────────────────────────────────────────────
    event SaleCreated(
        bytes32 indexed saleId,
        address indexed token,
        address indexed creator,
        uint256 priceGst,
        uint256 totalForSale,
        uint256 startsAt,
        uint256 endsAt
    );
    event TokensPurchased(
        bytes32 indexed saleId,
        address indexed buyer,
        uint256 gstSpent,
        uint256 tokensMinted
    );
    event ProceedsClaimed(bytes32 indexed saleId, address indexed creator, uint256 amount);

    // ── Data ──────────────────────────────────────────────────────────────────

    struct Sale {
        address token;        // CreatorToken contract
        address creator;      // proceeds recipient
        uint256 priceGst;     // GST per 1 fan-token (18-decimal)
        uint256 totalForSale; // max tokens available in this sale
        uint256 sold;         // tokens minted so far
        uint256 startsAt;     // unix timestamp
        uint256 endsAt;       // unix timestamp
        uint256 proceeds;     // accumulated GST (unclaimed)
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IGRC20 public immutable GST;
    mapping(bytes32 => Sale) public sales;

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _gst, address _admin) GhostOwnable(_admin) {
        if (_gst == address(0)) revert Sale__InvalidParams();
        GST = IGRC20(_gst);
    }

    // ── Creator: create sale ──────────────────────────────────────────────────

    /// @notice Creator opens a new token sale.
    /// @param saleId       Off-chain deterministic ID (e.g. keccak256(creator, nonce))
    /// @param token        CreatorToken address (must have `msg.sender` as token owner)
    /// @param priceGst     Cost in GST per single fan-token
    /// @param totalForSale Number of tokens available (must not exceed remaining cap)
    /// @param startsAt     Sale open timestamp
    /// @param endsAt       Sale close timestamp
    function createSale(
        bytes32 saleId,
        address token,
        uint256 priceGst,
        uint256 totalForSale,
        uint256 startsAt,
        uint256 endsAt
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Sale__WrongChain(L3_CHAIN_ID, block.chainid);
        if (sales[saleId].token != address(0)) revert Sale__AlreadyExists(saleId);
        if (token == address(0) || priceGst == 0 || totalForSale == 0) revert Sale__InvalidParams();
        if (startsAt >= endsAt) revert Sale__InvalidParams();

        // Verify caller is the token's creator/owner
        CreatorToken ct = CreatorToken(token);
        if (ct.CREATOR() != msg.sender) revert Sale__NotCreator();

        sales[saleId] = Sale({
            token:        token,
            creator:      msg.sender,
            priceGst:     priceGst,
            totalForSale: totalForSale,
            sold:         0,
            startsAt:     startsAt,
            endsAt:       endsAt,
            proceeds:     0
        });

        emit SaleCreated(saleId, token, msg.sender, priceGst, totalForSale, startsAt, endsAt);
    }

    // ── Fan: buy tokens ───────────────────────────────────────────────────────

    /// @notice Fan purchases `amount` fan tokens with GST.
    ///         Caller must have approved `priceGst * amount` GST to this contract.
    function buy(bytes32 saleId, uint256 amount) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Sale__WrongChain(L3_CHAIN_ID, block.chainid);
        if (amount == 0) revert Sale__ZeroAmount();

        Sale storage s = sales[saleId];
        if (s.token == address(0)) revert Sale__NotFound(saleId);
        if (block.timestamp < s.startsAt) revert Sale__NotStarted(saleId);
        if (block.timestamp > s.endsAt)   revert Sale__Ended(saleId);
        if (s.sold + amount > s.totalForSale) revert Sale__HardCapReached(saleId);

        uint256 gstCost = (s.priceGst * amount) / 1e18;
        if (!GST.transferFrom(msg.sender, address(this), gstCost)) revert Sale__TransferFailed();

        s.sold     += amount;
        s.proceeds += gstCost;

        // Mint fan tokens directly to buyer
        CreatorToken(s.token).mint(msg.sender, amount);

        emit TokensPurchased(saleId, msg.sender, gstCost, amount);
    }

    // ── Creator: claim proceeds ───────────────────────────────────────────────

    /// @notice Creator withdraws accumulated GST proceeds after the sale ends.
    function claimProceeds(bytes32 saleId) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert Sale__WrongChain(L3_CHAIN_ID, block.chainid);

        Sale storage s = sales[saleId];
        if (s.token == address(0)) revert Sale__NotFound(saleId);
        if (msg.sender != s.creator) revert Sale__NotCreator();
        if (block.timestamp <= s.endsAt) revert Sale__NotEnded(saleId);
        if (s.proceeds == 0) revert Sale__NothingToClaim();

        uint256 amount = s.proceeds;
        s.proceeds = 0;
        if (!GST.transfer(s.creator, amount)) revert Sale__TransferFailed();

        emit ProceedsClaimed(saleId, s.creator, amount);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Remaining tokens available to buy in a sale.
    function remaining(bytes32 saleId) external view returns (uint256) {
        Sale storage s = sales[saleId];
        if (s.token == address(0)) return 0;
        return s.totalForSale - s.sold;
    }

    /// @notice Whether a sale is currently active (open for purchases).
    function isActive(bytes32 saleId) external view returns (bool) {
        Sale storage s = sales[saleId];
        return s.token != address(0)
            && block.timestamp >= s.startsAt
            && block.timestamp <= s.endsAt
            && s.sold < s.totalForSale;
    }
}
