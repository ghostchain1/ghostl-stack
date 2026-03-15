// GhostChain Contracts v5.6.1 (contracts/src/l3/multiverse/VirtualEventTicket.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GRC721} from "../../ghost/GRC721.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";

/// @title  VirtualEventTicket
/// @notice GRC-721 event tickets for GhostChain Multiverse virtual events.
///         Creators list events (metaverse concerts, fan meetups, NFT exhibitions, etc.)
///         with GST-denominated ticket prices.  Fans buy tickets which are minted on-chain.
///         Creators claim GST proceeds after sale proceeds accumulate.
contract VirtualEventTicket is GhostBrand, GRC721, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error Ticket__WrongChain(uint256 expected, uint256 actual);
    error Ticket__AlreadyExists(bytes32 eventId);
    error Ticket__EventNotFound(bytes32 eventId);
    error Ticket__NotStarted(bytes32 eventId);
    error Ticket__EventEnded(bytes32 eventId);
    error Ticket__SoldOut(bytes32 eventId);
    error Ticket__NotCreator();
    error Ticket__NothingToClaim();
    error Ticket__InvalidParams();
    error Ticket__ZeroAddress();

    // ── Events ────────────────────────────────────────────────────────────────
    event EventCreated(
        bytes32 indexed eventId,
        address indexed creator,
        string  title,
        uint256 ticketPriceGst,
        uint256 maxTickets,
        uint256 startsAt,
        uint256 endsAt
    );
    event TicketMinted(bytes32 indexed eventId, uint256 indexed tokenId, address indexed buyer);
    event ProceedsClaimed(bytes32 indexed eventId, address indexed creator, uint256 amount);

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Event {
        address creator;
        string  title;
        bytes32 worldId;
        uint256 ticketPriceGst; // GST per ticket (18-decimal)
        uint256 maxTickets;     // 0 = unlimited
        uint256 ticketsSold;
        uint256 startsAt;
        uint256 endsAt;
        uint256 proceeds;
        bool    claimed;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IGRC20  public immutable GST;

    uint256 private _nextTokenId;

    mapping(bytes32 => Event)   public events;
    mapping(uint256 => bytes32) public ticketEvent; // tokenId → eventId

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _gst, address _admin)
        GRC721("GhostChain Event Ticket", "GKET")
        GhostOwnable(_admin)
    {
        if (_gst   == address(0)) revert Ticket__ZeroAddress();
        if (_admin == address(0)) revert Ticket__ZeroAddress();
        GST = IGRC20(_gst);
    }

    // ── Creator: create event ─────────────────────────────────────────────────

    /// @notice Create a virtual event with an optional GST ticket price and cap.
    /// @param eventId         Unique event identifier (arbitrary bytes32)
    /// @param title           Human-readable event title
    /// @param worldId         Target virtual world (matches WorldRegistry entry)
    /// @param ticketPriceGst  Price per ticket in GST (0 = free entry)
    /// @param maxTickets      Hard cap on tickets (0 = unlimited)
    /// @param startsAt        Unix timestamp — sale opens
    /// @param endsAt          Unix timestamp — sale closes
    function createEvent(
        bytes32         eventId,
        string calldata title,
        bytes32         worldId,
        uint256         ticketPriceGst,
        uint256         maxTickets,
        uint256         startsAt,
        uint256         endsAt
    ) external {
        if (block.chainid != L3_CHAIN_ID) revert Ticket__WrongChain(L3_CHAIN_ID, block.chainid);
        if (events[eventId].creator != address(0)) revert Ticket__AlreadyExists(eventId);
        if (bytes(title).length == 0)              revert Ticket__InvalidParams();
        if (startsAt >= endsAt || startsAt < block.timestamp) revert Ticket__InvalidParams();

        events[eventId] = Event({
            creator:        msg.sender,
            title:          title,
            worldId:        worldId,
            ticketPriceGst: ticketPriceGst,
            maxTickets:     maxTickets,
            ticketsSold:    0,
            startsAt:       startsAt,
            endsAt:         endsAt,
            proceeds:       0,
            claimed:        false
        });

        emit EventCreated(eventId, msg.sender, title, ticketPriceGst, maxTickets, startsAt, endsAt);
    }

    // ── Fan: buy ticket ───────────────────────────────────────────────────────

    /// @notice Purchase one ticket for the given event.
    ///         GST is transferred from the buyer; a GRC-721 ticket NFT is minted.
    function buyTicket(bytes32 eventId) external nonReentrant returns (uint256 tokenId) {
        if (block.chainid != L3_CHAIN_ID) revert Ticket__WrongChain(L3_CHAIN_ID, block.chainid);

        Event storage ev = events[eventId];
        if (ev.creator == address(0))                          revert Ticket__EventNotFound(eventId);
        if (block.timestamp < ev.startsAt)                     revert Ticket__NotStarted(eventId);
        if (block.timestamp > ev.endsAt)                       revert Ticket__EventEnded(eventId);
        if (ev.maxTickets > 0 && ev.ticketsSold >= ev.maxTickets) revert Ticket__SoldOut(eventId);

        if (ev.ticketPriceGst > 0) {
            bool ok = GST.transferFrom(msg.sender, address(this), ev.ticketPriceGst);
            require(ok, "Ticket: GST transfer failed");
            ev.proceeds += ev.ticketPriceGst;
        }

        tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);
        ticketEvent[tokenId] = eventId;
        ev.ticketsSold++;

        emit TicketMinted(eventId, tokenId, msg.sender);
    }

    // ── Creator: claim proceeds ───────────────────────────────────────────────

    /// @notice Withdraw accumulated GST proceeds for an event.
    ///         Can be called at any time — proceeds accrue even while the event is live.
    function claimProceeds(bytes32 eventId) external nonReentrant {
        Event storage ev = events[eventId];
        if (ev.creator != msg.sender) revert Ticket__NotCreator();
        if (ev.proceeds == 0)         revert Ticket__NothingToClaim();

        uint256 amount = ev.proceeds;
        ev.proceeds = 0;

        bool ok = GST.transfer(ev.creator, amount);
        require(ok, "Ticket: GST transfer failed");

        emit ProceedsClaimed(eventId, ev.creator, amount);
    }

    // ── Metadata ─────────────────────────────────────────────────────────────

    /// @notice Returns the event title as the token URI (can be overridden for full metadata).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "GRC721: URI query for nonexistent token");
        return events[ticketEvent[tokenId]].title;
    }

    // ── Block unguarded base mint ─────────────────────────────────────────────

    /// @dev Override base GRC721 open mint — use buyTicket() instead.
    function mint(address, uint256) public pure override {
        revert("VirtualEventTicket: use buyTicket()");
    }

    /// @notice Total ticket NFTs minted.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }
}
