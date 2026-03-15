// GhostChain Contracts v5.6.1 (test/foundry/LitVybzLive.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

// ── Ghost primitives ──────────────────────────────────────────────────────────
import {GRC20}               from "../../src/ghost/GRC20.sol";

// ── L3 contracts under test ───────────────────────────────────────────────────
import {AgencyRecruitment}   from "../../src/l3/AgencyRecruitment.sol";
import {AgencyRevenue}       from "../../src/l3/AgencyRevenue.sol";
import {CreatorPayout}       from "../../src/l3/CreatorPayout.sol";
import {CreatorTreasury}     from "../../src/l3/CreatorTreasury.sol";
import {EventRewards}        from "../../src/l3/EventRewards.sol";
import {GamePool}            from "../../src/l3/GamePool.sol";
import {GiftBatchProcessor}  from "../../src/l3/GiftBatchProcessor.sol";
import {HostReleaseMediator} from "../../src/l3/HostReleaseMediator.sol";
import {LitVybGiftEngine}    from "../../src/l3/LitVybGiftEngine.sol";
import {NFTGift}             from "../../src/l3/NFTGift.sol";
import {SettlementEngine}    from "../../src/l3/SettlementEngine.sol";

// ── Minimal concrete GST token ────────────────────────────────────────────────
contract MockGST is GRC20 {
    constructor() GRC20("Ghost Test Token", "GTT", 18) {}

    function mint(address to, uint256 amount) public override {
        super.mint(to, amount);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Test suite
// ─────────────────────────────────────────────────────────────────────────────

contract LitVybzLiveTest is Test {
    // Chain enforcement — all L3 contracts require chainid == 903
    uint256 constant L3_CHAIN_ID = 903;

    // Actors
    address owner     = makeAddr("owner");
    address alice     = makeAddr("alice");
    address bob       = makeAddr("bob");
    address platform  = makeAddr("platform");
    address agency    = makeAddr("agency");
    address oracle    = vm.addr(0xDEAD);

    MockGST gst;

    // Contracts
    AgencyRecruitment   recruitment;
    AgencyRevenue       revenue;
    CreatorPayout       payout;
    CreatorTreasury     treasury;
    EventRewards        eventRewards;
    GamePool            gamePool;
    GiftBatchProcessor  batchProcessor;
    LitVybGiftEngine    giftEngine;
    NFTGift             nftGift;
    SettlementEngine    settlement;
    HostReleaseMediator mediator;

    function setUp() public {
        // Deploy on L3
        vm.chainId(L3_CHAIN_ID);

        gst = new MockGST();

        vm.startPrank(owner);
        recruitment    = new AgencyRecruitment(owner);
        revenue        = new AgencyRevenue(address(gst), platform);
        payout         = new CreatorPayout(address(gst), owner);
        treasury       = new CreatorTreasury(address(gst));
        eventRewards   = new EventRewards(address(gst), owner);
        gamePool       = new GamePool(address(gst), platform);
        batchProcessor = new GiftBatchProcessor(address(gst), platform);
        giftEngine     = new LitVybGiftEngine(address(gst), platform);
        nftGift        = new NFTGift();
        settlement     = new SettlementEngine(address(gst), owner);
        mediator       = new HostReleaseMediator(address(recruitment), oracle, owner);
        vm.stopPrank();

        // Seed actors with GST
        gst.mint(alice, 10_000e18);
        gst.mint(bob,   10_000e18);
        gst.mint(owner, 10_000e18);

        // Wire mediator into recruitment
        vm.prank(owner);
        recruitment.setMediator(address(mediator));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  AgencyRecruitment
    // ─────────────────────────────────────────────────────────────────────────

    function test_recruitment_joinAndLeave() public {
        bytes32 agencyId = keccak256("agency-alpha");

        vm.prank(alice);
        recruitment.joinAgency(agencyId);
        assertEq(recruitment.hostToAgency(alice), agencyId);
        assertEq(recruitment.agencyHostCount(agencyId), 1);

        // owner can remove
        vm.prank(owner);
        recruitment.leaveAgency(alice);
        assertEq(recruitment.hostToAgency(alice), bytes32(0));
        assertEq(recruitment.agencyHostCount(agencyId), 0);
    }

    function test_recruitment_rejectsDoubleJoin() public {
        bytes32 agencyId = keccak256("agency-alpha");
        vm.prank(alice);
        recruitment.joinAgency(agencyId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgencyRecruitment.AlreadyInAgency.selector, alice, agencyId));
        recruitment.joinAgency(agencyId);
    }

    function test_recruitment_wrongChainReverts() public {
        vm.chainId(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgencyRecruitment.WrongChain.selector, L3_CHAIN_ID, 1));
        recruitment.joinAgency(keccak256("x"));
    }

    function test_recruitment_unauthorizedLeaveReverts() public {
        bytes32 agencyId = keccak256("agency-alpha");
        vm.prank(alice);
        recruitment.joinAgency(agencyId);

        vm.prank(bob); // not owner or mediator
        vm.expectRevert(AgencyRecruitment.Unauthorized.selector);
        recruitment.leaveAgency(alice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  AgencyRevenue
    // ─────────────────────────────────────────────────────────────────────────

    function test_revenue_split() public {
        uint256 amount = 1_000e18;

        vm.prank(alice);
        gst.approve(address(revenue), amount);

        uint256 platformBefore = gst.balanceOf(platform);
        uint256 bobBefore      = gst.balanceOf(bob);

        vm.prank(alice);
        revenue.split(bob, agency, amount);

        // creator gets 60%, agency gets 30%, platform gets 10%
        assertEq(gst.balanceOf(bob),      bobBefore + 600e18);
        assertEq(gst.balanceOf(agency),   300e18);
        assertEq(gst.balanceOf(platform), platformBefore + 100e18);
    }

    function test_revenue_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgencyRevenue.ZeroAmount.selector);
        revenue.split(bob, agency, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CreatorPayout
    // ─────────────────────────────────────────────────────────────────────────

    function test_payout_creditAndProcess() public {
        // owner is an operator: set alice as operator so she can credit
        vm.prank(owner);
        payout.setOperator(alice, true);

        // Fund the GST into payout contract via fund()
        vm.prank(owner);
        gst.approve(address(payout), 1_000e18);
        vm.prank(owner);
        payout.fund(1_000e18);

        // Alice credits bob
        vm.prank(alice);
        gst.approve(address(payout), 200e18);
        vm.prank(alice);
        payout.creditEarning(bob, 200e18);

        assertEq(payout.pendingPayout(bob), 200e18);

        // Bob requests payout
        vm.prank(bob);
        payout.requestPayout(100e18);
        assertEq(payout.pendingPayout(bob), 100e18);

        // Operator processes
        address[] memory creators = new address[](1);
        uint256[] memory amounts  = new uint256[](1);
        creators[0] = bob;
        amounts[0]  = 100e18;

        uint256 bobBefore = gst.balanceOf(bob);
        vm.prank(alice);
        payout.processPayouts(creators, amounts);
        assertEq(gst.balanceOf(bob), bobBefore + 100e18);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CreatorTreasury
    // ─────────────────────────────────────────────────────────────────────────

    function test_treasury_depositAndWithdraw() public {
        uint256 amount = 500e18;
        vm.prank(alice);
        gst.approve(address(treasury), amount);

        vm.prank(alice);
        treasury.deposit(amount);
        (uint256 bal,) = treasury.getVault(alice);
        assertEq(bal, amount);

        vm.prank(alice);
        treasury.withdraw(200e18);
        (bal,) = treasury.getVault(alice);
        assertEq(bal, 300e18);
    }

    function test_treasury_stakeAndUnstake() public {
        vm.prank(alice);
        gst.approve(address(treasury), 1_000e18);
        vm.prank(alice);
        treasury.deposit(1_000e18);

        vm.prank(alice);
        treasury.stake(400e18);
        (uint256 bal, uint256 staked) = treasury.getVault(alice);
        assertEq(bal,    600e18);
        assertEq(staked, 400e18);

        vm.prank(alice);
        treasury.unstake(200e18);
        (bal, staked) = treasury.getVault(alice);
        assertEq(bal,    800e18);
        assertEq(staked, 200e18);
    }

    function test_treasury_withdrawBeyondBalanceReverts() public {
        vm.prank(alice);
        gst.approve(address(treasury), 100e18);
        vm.prank(alice);
        treasury.deposit(100e18);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CreatorTreasury.InsufficientBalance.selector, 100e18, 200e18));
        treasury.withdraw(200e18);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EventRewards
    // ─────────────────────────────────────────────────────────────────────────

    function test_eventRewards_createAndDistribute() public {
        bytes32 eventId = keccak256("championship-2026");
        uint256 pool    = 1_000e18;

        vm.prank(owner);
        gst.approve(address(eventRewards), pool);
        vm.prank(owner);
        eventRewards.createEvent(eventId, pool);

        // Set operator
        vm.prank(owner);
        eventRewards.setOperator(alice, true);

        address[] memory winners  = new address[](2);
        uint256[] memory prizes   = new uint256[](2);
        winners[0] = bob;
        winners[1] = agency;
        prizes[0]  = 600e18;
        prizes[1]  = 200e18;

        uint256 bobBefore = gst.balanceOf(bob);
        vm.prank(alice);
        eventRewards.distributePrizes(eventId, winners, prizes);
        assertEq(gst.balanceOf(bob), bobBefore + 600e18);
    }

    function test_eventRewards_closeRefundsRemaining() public {
        bytes32 eventId = keccak256("mini-event");
        vm.prank(owner);
        gst.approve(address(eventRewards), 500e18);
        vm.prank(owner);
        eventRewards.createEvent(eventId, 500e18);

        uint256 ownerBefore = gst.balanceOf(owner);
        vm.prank(owner);
        eventRewards.closeEvent(eventId);
        assertEq(gst.balanceOf(owner), ownerBefore + 500e18);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GamePool
    // ─────────────────────────────────────────────────────────────────────────

    function test_gamePool_fullCycle() public {
        bytes32 gameId   = keccak256("ghost-royale-1");
        uint256 entryFee = 100e18;

        vm.prank(owner);
        gamePool.createGame(gameId, "Ghost Royale", entryFee);

        // Alice joins (5% fee to platform via platformFeeBps=500, 95% to pool)
        vm.prank(alice);
        gst.approve(address(gamePool), entryFee);
        vm.prank(alice);
        gamePool.joinGame(gameId);

        (, , uint256 pool, ,) = gamePool.games(gameId);
        assertEq(pool, 95e18);

        // Distribute prize
        uint256 bobBefore = gst.balanceOf(bob);
        vm.prank(owner);
        gamePool.distributePrize(gameId, bob);
        assertEq(gst.balanceOf(bob), bobBefore + 95e18);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GiftBatchProcessor
    // ─────────────────────────────────────────────────────────────────────────

    function test_batchProcessor_processBatch() public {
        GiftBatchProcessor.GiftItem[] memory items = new GiftBatchProcessor.GiftItem[](2);
        items[0] = GiftBatchProcessor.GiftItem(bob,    50e18, "dragon");
        items[1] = GiftBatchProcessor.GiftItem(agency, 50e18, "crown");

        // Total = 100e18; 8% fee = 8e18 total; creator shares = 92e18 total
        vm.prank(alice);
        gst.approve(address(batchProcessor), 100e18);

        uint256 bobBefore    = gst.balanceOf(bob);
        uint256 agencyBefore = gst.balanceOf(agency);
        vm.prank(alice);
        batchProcessor.processBatch(items);

        assertEq(gst.balanceOf(bob),    bobBefore    + 46e18); // 50 - 4 (8%)
        assertEq(gst.balanceOf(agency), agencyBefore + 46e18);
    }

    function test_batchProcessor_emptyBatchReverts() public {
        GiftBatchProcessor.GiftItem[] memory items = new GiftBatchProcessor.GiftItem[](0);
        vm.prank(alice);
        vm.expectRevert(GiftBatchProcessor.EmptyBatch.selector);
        batchProcessor.processBatch(items);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LitVybGiftEngine
    // ─────────────────────────────────────────────────────────────────────────

    function test_giftEngine_sendGift() public {
        uint256 amount = 200e18;
        vm.prank(alice);
        gst.approve(address(giftEngine), amount);

        uint256 bobBefore      = gst.balanceOf(bob);
        uint256 platformBefore = gst.balanceOf(platform);

        vm.prank(alice);
        giftEngine.sendGift(bob, amount, "dragon");

        // 10% fee → platform, 90% → creator
        assertEq(gst.balanceOf(bob),      bobBefore      + 180e18);
        assertEq(gst.balanceOf(platform), platformBefore + 20e18);
        assertEq(giftEngine.creatorEarnings(bob), 180e18);
    }

    function test_giftEngine_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(LitVybGiftEngine.ZeroAmount.selector);
        giftEngine.sendGift(bob, 0, "dragon");
    }

    function test_giftEngine_invalidCreatorReverts() public {
        vm.prank(alice);
        gst.approve(address(giftEngine), 100e18);
        vm.prank(alice);
        vm.expectRevert(LitVybGiftEngine.InvalidCreator.selector);
        giftEngine.sendGift(address(0), 100e18, "dragon");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  NFTGift
    // ─────────────────────────────────────────────────────────────────────────

    function test_nftGift_mintAndTokenURI() public {
        // Set alice as minter
        vm.prank(owner);
        nftGift.setMinter(alice, true);

        vm.prank(alice);
        uint256 tokenId = nftGift.mint(bob, "dragon", "ipfs://QmDragon");

        assertEq(nftGift.ownerOf(tokenId), bob);
        assertEq(nftGift.tokenURI(tokenId), "ipfs://QmDragon");
        assertEq(nftGift.tokenGiftId(tokenId), "dragon");
    }

    function test_nftGift_nameAndSymbol() public view {
        assertEq(nftGift.name(),   "GhostChain NFT Gift");
        assertEq(nftGift.symbol(), "GNFTG");
    }

    function test_nftGift_unauthorizedMintReverts() public {
        vm.prank(bob); // not a minter
        vm.expectRevert(NFTGift.Unauthorized.selector);
        nftGift.mint(alice, "crown", "ipfs://QmCrown");
    }

    function test_nftGift_wrongChainReverts() public {
        vm.prank(owner);
        nftGift.setMinter(alice, true);

        vm.chainId(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NFTGift.WrongChain.selector, L3_CHAIN_ID, 1));
        nftGift.mint(bob, "dragon", "ipfs://QmDragon");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SettlementEngine
    // ─────────────────────────────────────────────────────────────────────────

    function test_settlement_settleBatch() public {
        // Fund contract
        vm.prank(owner);
        gst.approve(address(settlement), 1_000e18);
        vm.prank(owner);
        settlement.deposit(1_000e18);

        // Set alice as operator
        vm.prank(owner);
        settlement.setOperator(alice, true);

        SettlementEngine.Settlement[] memory items = new SettlementEngine.Settlement[](2);
        items[0] = SettlementEngine.Settlement(bob,    300e18, keccak256("session-1"));
        items[1] = SettlementEngine.Settlement(agency, 200e18, keccak256("session-2"));

        uint256 bobBefore    = gst.balanceOf(bob);
        uint256 agencyBefore = gst.balanceOf(agency);
        vm.prank(alice);
        settlement.settleBatch(items);

        assertEq(gst.balanceOf(bob),    bobBefore    + 300e18);
        assertEq(gst.balanceOf(agency), agencyBefore + 200e18);
    }

    function test_settlement_rejectsDoubleSettlement() public {
        vm.prank(owner);
        gst.approve(address(settlement), 500e18);
        vm.prank(owner);
        settlement.deposit(500e18);

        SettlementEngine.Settlement[] memory items = new SettlementEngine.Settlement[](1);
        bytes32 sid = keccak256("session-dup");
        items[0] = SettlementEngine.Settlement(bob, 100e18, sid);

        vm.prank(owner);
        settlement.settleBatch(items);

        // Attempt to settle same session again
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SettlementEngine.SessionAlreadySettled.selector, sid));
        settlement.settleBatch(items);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  HostReleaseMediator
    // ─────────────────────────────────────────────────────────────────────────

    function test_mediator_requestRelease() public {
        bytes32 agencyId = keccak256("agency-beta");
        vm.prank(alice);
        recruitment.joinAgency(agencyId);

        vm.prank(alice);
        bytes32 requestId = mediator.requestRelease("Seeking independence");

        HostReleaseMediator.ReleaseRequest memory req = mediator.getRequest(requestId);
        assertEq(req.host, alice);
        assertEq(req.agencyId, agencyId);
        assertEq(uint8(req.decision), uint8(HostReleaseMediator.Decision.Pending));
    }

    function test_mediator_executeRelease_approved() public {
        bytes32 agencyId = keccak256("agency-exec");
        vm.prank(alice);
        recruitment.joinAgency(agencyId);

        vm.prank(alice);
        bytes32 requestId = mediator.requestRelease("Want to go solo");

        // Build the message oracle would sign: keccak256(requestId ++ decision)
        bytes32 msgHash;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, requestId)
            mstore8(add(ptr, 0x20), 1) // Decision.Approved = 1
            msgHash := keccak256(ptr, 0x21)
        }

        // Oracle signs with Ethereum prefix
        bytes32 prefixed = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xDEAD, prefixed);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(alice);
        mediator.executeRelease(requestId, HostReleaseMediator.Decision.Approved, sig);

        // Alice should no longer be in the agency
        assertEq(recruitment.hostToAgency(alice), bytes32(0));

        HostReleaseMediator.ReleaseRequest memory req = mediator.getRequest(requestId);
        assertEq(uint8(req.decision), uint8(HostReleaseMediator.Decision.Approved));
    }

    function test_mediator_badSignatureReverts() public {
        bytes32 agencyId = keccak256("agency-bad-sig");
        vm.prank(alice);
        recruitment.joinAgency(agencyId);

        vm.prank(alice);
        bytes32 requestId = mediator.requestRelease("Test");

        // Sign with wrong key
        bytes32 wrongHash = keccak256("wrong");
        bytes32 prefixed  = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", wrongHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, prefixed);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(alice);
        vm.expectRevert(HostReleaseMediator.InvalidSignature.selector);
        mediator.executeRelease(requestId, HostReleaseMediator.Decision.Approved, sig);
    }

    function test_mediator_notInAgencyReverts() public {
        // alice not in any agency
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HostReleaseMediator.NotInAnyAgency.selector, alice));
        mediator.requestRelease("No agency");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Cross-contract: GiftEngine → CreatorPayout (operator wiring)
    // ─────────────────────────────────────────────────────────────────────────

    function test_crossContract_giftThenWithdraw() public {
        // Creator bob receives a gift via LitVybGiftEngine
        uint256 giftAmount = 500e18;
        vm.prank(alice);
        gst.approve(address(giftEngine), giftAmount);
        vm.prank(alice);
        giftEngine.sendGift(bob, giftAmount, "star");
        // bob received 90% = 450e18 directly — no payout needed here

        // Separately verify payout contract works for bob's batch earnings
        vm.prank(owner);
        payout.setOperator(alice, true);

        vm.prank(owner);
        gst.approve(address(payout), 450e18);
        vm.prank(owner);
        payout.fund(450e18);

        vm.prank(alice);
        gst.approve(address(payout), 450e18);
        vm.prank(alice);
        payout.creditEarning(bob, 450e18);

        vm.prank(bob);
        payout.requestPayout(450e18);

        address[] memory cs = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        cs[0]  = bob;
        as_[0] = 450e18;
        uint256 bobBefore = gst.balanceOf(bob);
        vm.prank(alice);
        payout.processPayouts(cs, as_);
        assertEq(gst.balanceOf(bob), bobBefore + 450e18);
    }
}
