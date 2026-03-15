// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GRC20} from "../../src/ghost/GRC20.sol";
import {AvatarNFT} from "../../src/l3/multiverse/AvatarNFT.sol";
import {WorldRegistry} from "../../src/l3/multiverse/WorldRegistry.sol";
import {VirtualEventTicket} from "../../src/l3/multiverse/VirtualEventTicket.sol";

// ── Minimal GST mock ──────────────────────────────────────────────────────────

contract MockGST is GRC20 {
    constructor() GRC20("Ghost Stable Token", "GST", 18) {}
    function mintTo(address to, uint256 amt) external { _mint(to, amt); }
}

// ── Test suite ────────────────────────────────────────────────────────────────

contract MultiverseTest is Test {
    uint256 constant L3 = 903;

    address admin   = makeAddr("admin");
    address alice   = makeAddr("alice");   // creator
    address bob     = makeAddr("bob");     // fan / ticket buyer
    address minter  = makeAddr("minter");  // authorised minter for AvatarNFT

    MockGST          gst;
    AvatarNFT        avatarNFT;
    WorldRegistry    registry;
    VirtualEventTicket ticketEngine;

    // Canonical world id
    bytes32 constant GHOST_ARENA    = keccak256("GhostArena");
    bytes32 constant GHOST_CITY     = keccak256("GhostCity");

    function setUp() public {
        vm.chainId(L3);

        gst          = new MockGST();
        avatarNFT    = new AvatarNFT(admin);
        registry     = new WorldRegistry(admin);
        ticketEngine = new VirtualEventTicket(address(gst), admin);

        // Grant minting rights to the minter address
        vm.prank(admin);
        avatarNFT.setMinter(minter, true);

        // Fund fans
        gst.mintTo(bob, 10_000e18);
    }

    // ══════════════════════════════════════════════════════════════
    // AvatarNFT
    // ══════════════════════════════════════════════════════════════

    function test_avatar_mintByMinter() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "https://cdn.ghost/av1.glb", "idle");

        assertEq(avatarNFT.ownerOf(tokenId), alice);
        (address creator, string memory uri,,) = avatarNFT.avatarMeta(tokenId);
        assertEq(creator, alice);
        assertEq(uri, "https://cdn.ghost/av1.glb");
    }

    function test_avatar_mintByOwner() public {
        vm.prank(admin);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "https://cdn.ghost/av2.glb", "dance");
        assertEq(avatarNFT.ownerOf(tokenId), alice);
    }

    function test_avatar_notMinter_reverts() public {
        vm.expectRevert(AvatarNFT.AvatarNFT__NotMinter.selector);
        vm.prank(bob);
        avatarNFT.mintAvatar(bob, "https://cdn.ghost/av3.glb", "idle");
    }

    function test_avatar_wrongChain_reverts() public {
        vm.chainId(1);
        vm.expectRevert();
        vm.prank(minter);
        avatarNFT.mintAvatar(alice, "uri", "idle");
    }

    function test_avatar_update() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "uri-v1", "idle");

        // Owner can update
        vm.prank(alice);
        avatarNFT.updateAvatar(tokenId, "uri-v2", "dance");

        (, string memory uri,,) = avatarNFT.avatarMeta(tokenId);
        assertEq(uri, "uri-v2");
    }

    function test_avatar_updateByMinter() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "uri-v1", "idle");

        // Authorised minter can update too
        vm.prank(minter);
        avatarNFT.updateAvatar(tokenId, "uri-v3", "cheer");

        (, string memory uri,,) = avatarNFT.avatarMeta(tokenId);
        assertEq(uri, "uri-v3");
    }

    function test_avatar_updateUnauthorised_reverts() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "uri", "idle");

        vm.expectRevert(AvatarNFT.AvatarNFT__NotAuthorised.selector);
        vm.prank(bob);
        avatarNFT.updateAvatar(tokenId, "evil-uri", "idle");
    }

    function test_avatar_emptyURI_reverts() public {
        vm.expectRevert(AvatarNFT.AvatarNFT__EmptyURI.selector);
        vm.prank(minter);
        avatarNFT.mintAvatar(alice, "", "idle");
    }

    function test_avatar_zeroAddress_reverts() public {
        vm.expectRevert(AvatarNFT.AvatarNFT__ZeroAddress.selector);
        vm.prank(minter);
        avatarNFT.mintAvatar(address(0), "uri", "idle");
    }

    function test_avatar_setMinterOnlyOwner() public {
        vm.expectRevert();
        vm.prank(alice);
        avatarNFT.setMinter(alice, true);
    }

    function test_avatar_tokenURI() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "https://cdn.ghost/meta/1.glb", "idle");
        assertEq(avatarNFT.tokenURI(tokenId), "https://cdn.ghost/meta/1.glb");
    }

    function test_avatar_transfer() public {
        vm.prank(minter);
        uint256 tokenId = avatarNFT.mintAvatar(alice, "uri", "idle");

        vm.prank(alice);
        avatarNFT.transferFrom(alice, bob, tokenId);
        assertEq(avatarNFT.ownerOf(tokenId), bob);
    }

    function test_avatar_totalMinted() public {
        vm.startPrank(minter);
        avatarNFT.mintAvatar(alice, "uri1", "idle");
        avatarNFT.mintAvatar(bob,   "uri2", "dance");
        vm.stopPrank();
        assertEq(avatarNFT.totalMinted(), 2);
    }

    function test_avatar_baseMint_reverts() public {
        vm.expectRevert();
        avatarNFT.mint(alice, 0);
    }

    // ══════════════════════════════════════════════════════════════
    // WorldRegistry
    // ══════════════════════════════════════════════════════════════

    function test_world_register() public {
        string[] memory assets = new string[](2);
        assets[0] = "avatar";
        assets[1] = "nft";

        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "https://ghostarena.io/api", assets);

        (string memory name, string memory endpoint, bool active,) = registry.worlds(GHOST_ARENA);
        assertEq(name, "GhostArena");
        assertEq(endpoint, "https://ghostarena.io/api");
        assertTrue(active);
    }

    function test_world_wrongChain_reverts() public {
        vm.chainId(1);
        string[] memory assets = new string[](0);
        vm.expectRevert();
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", assets);
    }

    function test_world_onlyOwner_reverts() public {
        string[] memory assets = new string[](0);
        vm.expectRevert();
        vm.prank(alice);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", assets);
    }

    function test_world_duplicateReverts() public {
        string[] memory assets = new string[](0);
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", assets);

        vm.expectRevert(abi.encodeWithSelector(WorldRegistry.WorldRegistry__AlreadyRegistered.selector, GHOST_ARENA));
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena2", "", assets);
    }

    function test_world_setActive() public {
        string[] memory assets = new string[](0);
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", assets);

        vm.prank(admin);
        registry.setWorldActive(GHOST_ARENA, false);
        assertFalse(registry.isActive(GHOST_ARENA));

        vm.prank(admin);
        registry.setWorldActive(GHOST_ARENA, true);
        assertTrue(registry.isActive(GHOST_ARENA));
    }

    function test_world_updateAssets() public {
        string[] memory original = new string[](1);
        original[0] = "avatar";
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", original);

        string[] memory updated = new string[](2);
        updated[0] = "avatar";
        updated[1] = "ticket";
        vm.prank(admin);
        registry.updateWorldAssets(GHOST_ARENA, updated);

        string[] memory result = registry.getWorldAssets(GHOST_ARENA);
        assertEq(result.length, 2);
        assertEq(result[1], "ticket");
    }

    function test_world_listWorlds() public {
        string[] memory a = new string[](0);
        vm.startPrank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", a);
        registry.registerWorld(GHOST_CITY,  "GhostCity",  "", a);
        vm.stopPrank();

        bytes32[] memory ids = registry.listWorlds(0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], GHOST_ARENA);
        assertEq(ids[1], GHOST_CITY);
    }

    function test_world_totalWorlds() public {
        string[] memory a = new string[](0);
        assertEq(registry.totalWorlds(), 0);
        vm.prank(admin);
        registry.registerWorld(GHOST_ARENA, "GhostArena", "", a);
        assertEq(registry.totalWorlds(), 1);
    }

    // ══════════════════════════════════════════════════════════════
    // VirtualEventTicket
    // ══════════════════════════════════════════════════════════════

    bytes32 constant EVENT_ID = keccak256("concert-1");

    function _createEvent(uint256 price, uint256 maxTickets) internal {
        uint256 start = block.timestamp + 1;
        uint256 end_  = block.timestamp + 3 days;
        vm.prank(alice);
        ticketEngine.createEvent(EVENT_ID, "Ghost Concert", GHOST_ARENA, price, maxTickets, start, end_);
        vm.warp(start + 1);
    }

    function test_ticket_createEvent() public {
        _createEvent(100e18, 500);
        (
            address creator,
            string memory title,
            ,              // worldId
            uint256 price,
            ,              // maxTickets
            ,              // ticketsSold
            ,              // startsAt
            ,              // endsAt
            ,              // proceeds
                           // claimed
        ) = ticketEngine.events(EVENT_ID);
        assertEq(creator, alice);
        assertEq(title, "Ghost Concert");
        assertEq(price, 100e18);
    }

    function test_ticket_buyFreeTicket() public {
        _createEvent(0, 100);
        vm.prank(bob);
        uint256 tokenId = ticketEngine.buyTicket(EVENT_ID);
        assertEq(ticketEngine.ownerOf(tokenId), bob);
        assertEq(ticketEngine.ticketEvent(tokenId), EVENT_ID);
    }

    function test_ticket_buyPaidTicket() public {
        _createEvent(50e18, 100);
        vm.prank(bob);
        gst.approve(address(ticketEngine), 50e18);
        vm.prank(bob);
        uint256 tokenId = ticketEngine.buyTicket(EVENT_ID);
        assertEq(ticketEngine.ownerOf(tokenId), bob);
    }

    function test_ticket_proceeds() public {
        _createEvent(100e18, 10);

        // Bob + Carol buy tickets
        address carol = makeAddr("carol");
        gst.mintTo(carol, 10_000e18);

        vm.prank(bob);
        gst.approve(address(ticketEngine), 100e18);
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);

        vm.prank(carol);
        gst.approve(address(ticketEngine), 100e18);
        vm.prank(carol);
        ticketEngine.buyTicket(EVENT_ID);

        // Creator claims 200 GST
        uint256 before = gst.balanceOf(alice);
        vm.prank(alice);
        ticketEngine.claimProceeds(EVENT_ID);
        assertEq(gst.balanceOf(alice) - before, 200e18);
    }

    function test_ticket_soldOut_reverts() public {
        _createEvent(0, 1);  // max 1 ticket
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);

        // Second buy should revert with SoldOut
        vm.expectRevert(abi.encodeWithSelector(VirtualEventTicket.Ticket__SoldOut.selector, EVENT_ID));
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);
    }

    function test_ticket_eventEnded_reverts() public {
        _createEvent(0, 100);
        vm.warp(block.timestamp + 4 days); // past end

        vm.expectRevert(abi.encodeWithSelector(VirtualEventTicket.Ticket__EventEnded.selector, EVENT_ID));
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);
    }

    function test_ticket_notStarted_reverts() public {
        uint256 start = block.timestamp + 100;
        uint256 end_  = block.timestamp + 3 days;
        vm.prank(alice);
        ticketEngine.createEvent(EVENT_ID, "Ghost Concert", GHOST_ARENA, 0, 0, start, end_);
        // Do NOT warp — still before start

        vm.expectRevert(abi.encodeWithSelector(VirtualEventTicket.Ticket__NotStarted.selector, EVENT_ID));
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);
    }

    function test_ticket_wrongChain_reverts() public {
        vm.chainId(1);
        vm.expectRevert();
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);
    }

    function test_ticket_claimNotCreator_reverts() public {
        _createEvent(50e18, 10);
        vm.prank(bob);
        gst.approve(address(ticketEngine), 50e18);
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);

        vm.expectRevert(VirtualEventTicket.Ticket__NotCreator.selector);
        vm.prank(bob);
        ticketEngine.claimProceeds(EVENT_ID);
    }

    function test_ticket_claimNothingToClaim_reverts() public {
        _createEvent(0, 10);  // free event — no proceeds
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);

        vm.expectRevert(VirtualEventTicket.Ticket__NothingToClaim.selector);
        vm.prank(alice);
        ticketEngine.claimProceeds(EVENT_ID);
    }

    function test_ticket_duplicateEvent_reverts() public {
        _createEvent(0, 10);
        uint256 start = block.timestamp + 1;
        uint256 end_  = block.timestamp + 3 days;
        vm.expectRevert(abi.encodeWithSelector(VirtualEventTicket.Ticket__AlreadyExists.selector, EVENT_ID));
        vm.prank(alice);
        ticketEngine.createEvent(EVENT_ID, "Duplicate", GHOST_ARENA, 0, 0, start, end_);
    }

    function test_ticket_invalidParams_reverts() public {
        // startsAt == endsAt
        vm.expectRevert(VirtualEventTicket.Ticket__InvalidParams.selector);
        vm.prank(alice);
        ticketEngine.createEvent(keccak256("bad"), "Bad", GHOST_ARENA, 0, 0, block.timestamp + 1, block.timestamp + 1);
    }

    function test_ticket_totalMinted() public {
        _createEvent(0, 100);
        vm.prank(bob);
        ticketEngine.buyTicket(EVENT_ID);
        assertEq(ticketEngine.totalMinted(), 1);
    }

    function test_ticket_baseMint_reverts() public {
        vm.expectRevert();
        ticketEngine.mint(bob, 0);
    }

    function testFuzz_ticket_paidBuy(uint64 price, uint16 count) public {
        // price 1e14..1e20, count 1..20
        price = uint64(bound(price, 1e14, 1e20));
        count = uint16(bound(count, 1, 20));

        uint256 p    = price;
        uint256 need = p * count;
        address fan  = makeAddr("fuzzyFan");
        gst.mintTo(fan, need);

        uint256 start = block.timestamp + 1;
        bytes32 sid   = keccak256(abi.encode(price, count));
        vm.prank(alice);
        ticketEngine.createEvent(sid, "Fuzz Event", GHOST_ARENA, p, count, start, block.timestamp + 7 days);
        vm.warp(start + 1);

        vm.startPrank(fan);
        for (uint256 i = 0; i < count; i++) {
            gst.approve(address(ticketEngine), p);
            ticketEngine.buyTicket(sid);
        }
        vm.stopPrank();

        (
            ,              // creator
            ,              // title
            ,              // worldId
            ,              // ticketPriceGst
            ,              // maxTickets
            uint256 sold,
            ,              // startsAt
            ,              // endsAt
            uint256 proceeds,
                           // claimed
        ) = ticketEngine.events(sid);
        assertEq(sold, uint256(count));
        assertEq(proceeds, need);
    }
}
