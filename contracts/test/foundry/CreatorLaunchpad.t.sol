// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GRC20} from "../../src/ghost/GRC20.sol";
import {CreatorToken} from "../../src/l3/launchpad/CreatorToken.sol";
import {CreatorTokenFactory} from "../../src/l3/launchpad/CreatorTokenFactory.sol";
import {TokenSaleEngine} from "../../src/l3/launchpad/TokenSaleEngine.sol";
import {CreatorDAO} from "../../src/l3/launchpad/CreatorDAO.sol";

// ── Minimal GST mock ──────────────────────────────────────────────────────────

contract MockGST is GRC20 {
    constructor() GRC20("Ghost Stable Token", "GST", 18) {}
    function mintTo(address to, uint256 amt) external { _mint(to, amt); }
}

// ── Test suite ────────────────────────────────────────────────────────────────

contract CreatorLaunchpadTest is Test {
    // Chain ID enforced by all contracts
    uint256 constant L3 = 903;

    // Actors
    address admin   = makeAddr("admin");
    address alice   = makeAddr("alice");   // creator
    address bob     = makeAddr("bob");     // fan / buyer
    address carol   = makeAddr("carol");   // second fan

    // Contracts
    MockGST          gst;
    CreatorTokenFactory factory;
    TokenSaleEngine  engine;
    CreatorDAO       dao;

    function setUp() public {
        vm.chainId(L3);

        gst     = new MockGST();
        engine  = new TokenSaleEngine(address(gst), admin);
        factory = new CreatorTokenFactory(admin, address(engine));
        dao     = new CreatorDAO();

        // Fund fans with GST
        gst.mintTo(bob,   100_000e18);
        gst.mintTo(carol,  50_000e18);
    }

    // ── Helper: launch a creator token ─────────────────────────────────────────
    function _launchAlice() internal returns (CreatorToken ct) {
        vm.prank(alice);
        address addr = factory.launch("Nova Fan Token", "NOVA", 1_000_000e18);
        ct = CreatorToken(addr);
    }

    // ── Helper: create a sale ──────────────────────────────────────────────────
    function _openSale(
        CreatorToken ct,
        uint256 priceGst,
        uint256 supply,
        bytes32 saleId
    ) internal {
        uint256 start = block.timestamp + 1;
        uint256 end_  = block.timestamp + 7 days;
        vm.prank(alice);
        engine.createSale(saleId, address(ct), priceGst, supply, start, end_);
        // Advance into sale window
        vm.warp(start + 1);
    }

    // ═══════════════════════════════════════════════════════════
    // ── CreatorTokenFactory ────────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    function test_factory_wrongChain() public {
        vm.chainId(1); // not L3
        vm.expectRevert();
        vm.prank(alice);
        factory.launch("Nova Fan Token", "NOVA", 1_000_000e18);
    }

    function test_factory_launch() public {
        CreatorToken ct = _launchAlice();
        assertEq(ct.name(),      "Nova Fan Token");
        assertEq(ct.symbol(),    "NOVA");
        assertEq(ct.MAX_SUPPLY(), 1_000_000e18);
        assertEq(ct.CREATOR(),    alice);
        assertEq(ct.minter(),     address(engine));
        assertEq(factory.totalTokens(), 1);
    }

    function test_factory_onlyOnePerCreator() public {
        _launchAlice();
        vm.expectRevert(abi.encodeWithSelector(CreatorTokenFactory.Factory__AlreadyLaunched.selector, alice));
        vm.prank(alice);
        factory.launch("Nova2", "NOV2", 500_000e18);
    }

    function test_factory_listTokens() public {
        _launchAlice();
        address[] memory list = factory.listTokens(0, 10);
        assertEq(list.length, 1);
    }

    function test_factory_setDefaultMinter_onlyOwner() public {
        vm.expectRevert();
        vm.prank(alice);
        factory.setDefaultMinter(address(this));
    }

    // ═══════════════════════════════════════════════════════════
    // ── CreatorToken ───────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    function test_token_mintOnlyByMinter() public {
        CreatorToken ct = _launchAlice();
        vm.expectRevert(CreatorToken.CreatorToken__NotMinter.selector);
        vm.prank(alice);
        ct.mint(alice, 1e18);
    }

    function test_token_capEnforced() public {
        // Deploy token with tiny cap (10 whole tokens = 10e18 base units)
        vm.prank(alice);
        address addr = factory.launch("Tiny", "TINY", 10e18);
        CreatorToken ct = CreatorToken(addr);

        // First sale: 5 tokens at 1 GST each
        bytes32 sid = keccak256("sale1");
        _openSale(ct, 1e18, 5e18, sid);

        // Bob buys all 5 tokens in first sale: cost = (1e18 * 5e18) / 1e18 = 5e18 GST
        vm.prank(bob);
        gst.approve(address(engine), 5e18);
        vm.prank(bob);
        engine.buy(sid, 5e18);

        // Advance past first sale
        vm.warp(block.timestamp + 7 days + 1);

        // Second sale: 6 tokens at 1 GST each — would exceed cap (5 minted + 6 > 10)
        bytes32 sid2 = keccak256("sale2");
        vm.prank(alice);
        engine.createSale(sid2, address(ct), 1e18, 6e18, block.timestamp + 1, block.timestamp + 7 days);
        vm.warp(block.timestamp + 2);

        // Cost for 6 whole tokens: (1e18 * 6e18) / 1e18 = 6e18
        vm.prank(bob);
        gst.approve(address(engine), 6e18);
        vm.expectRevert();
        vm.prank(bob);
        engine.buy(sid2, 6e18);
    }

    function test_token_pause() public {
        CreatorToken ct = _launchAlice();

        // Mint tokens to bob: 10 whole tokens, 1 GST each → cost = (1e18 * 10e18)/1e18 = 10e18
        bytes32 sid = keccak256("pauseSale");
        _openSale(ct, 1e18, 100e18, sid);
        vm.prank(bob);
        gst.approve(address(engine), 10e18);
        vm.prank(bob);
        engine.buy(sid, 10e18);

        // Pause transfers
        vm.prank(alice);  // owner = alice (the CREATOR passed to GhostOwnable)
        ct.setPaused(true);

        vm.expectRevert(CreatorToken.CreatorToken__Paused.selector);
        vm.prank(bob);
        ct.transfer(carol, 1e18);
    }

    function test_token_setMinter_onlyOwner() public {
        CreatorToken ct = _launchAlice();
        vm.expectRevert();
        vm.prank(bob);
        ct.setMinter(bob);
    }

    // ═══════════════════════════════════════════════════════════
    // ── TokenSaleEngine ────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    function test_sale_create() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("s1");
        vm.prank(alice);
        engine.createSale(sid, address(ct), 2e18, 500e18, block.timestamp + 1, block.timestamp + 3 days);
        assertFalse(engine.isActive(sid)); // not started yet
    }

    function test_sale_buy() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("buy1");
        _openSale(ct, 2e18, 100e18, sid); // 2 GST per whole token, 100 tokens for sale

        assertTrue(engine.isActive(sid));

        // Bob buys 10 whole tokens: cost = (2e18 * 10e18) / 1e18 = 20e18 GST
        vm.prank(bob);
        gst.approve(address(engine), 20e18);
        vm.prank(bob);
        engine.buy(sid, 10e18);

        assertEq(ct.balanceOf(bob), 10e18);
        assertEq(gst.balanceOf(address(engine)), 20e18);
        assertEq(engine.remaining(sid), 90e18);
    }

    function test_sale_wrongChain_buy() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("wcb");
        _openSale(ct, 1e18, 50e18, sid);

        vm.chainId(1);
        vm.expectRevert();
        vm.prank(bob);
        engine.buy(sid, 1e18);
    }

    function test_sale_notStarted() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("ns");
        uint256 start = block.timestamp + 100;
        vm.prank(alice);
        engine.createSale(sid, address(ct), 1e18, 100e18, start, start + 3 days);

        vm.expectRevert(abi.encodeWithSelector(TokenSaleEngine.Sale__NotStarted.selector, sid));
        vm.prank(bob);
        engine.buy(sid, 1e18);
    }

    function test_sale_ended() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("ended");
        _openSale(ct, 1e18, 100e18, sid);
        vm.warp(block.timestamp + 8 days);

        vm.expectRevert(abi.encodeWithSelector(TokenSaleEngine.Sale__Ended.selector, sid));
        vm.prank(bob);
        engine.buy(sid, 1e18);
    }

    function test_sale_hardCap() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("hc");
        _openSale(ct, 1e18, 5e18, sid);

        vm.prank(bob);
        gst.approve(address(engine), 6e18);
        vm.expectRevert(abi.encodeWithSelector(TokenSaleEngine.Sale__HardCapReached.selector, sid));
        vm.prank(bob);
        engine.buy(sid, 6e18);
    }

    function test_sale_claimProceeds() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("claim");
        _openSale(ct, 2e18, 100e18, sid);

        vm.prank(bob);
        gst.approve(address(engine), 20e18);
        vm.prank(bob);
        engine.buy(sid, 10e18);

        // End the sale
        vm.warp(block.timestamp + 8 days);

        uint256 before = gst.balanceOf(alice);
        vm.prank(alice);
        engine.claimProceeds(sid);
        assertEq(gst.balanceOf(alice), before + 20e18);
    }

    function test_sale_claimProceeds_notCreator() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("claimNC");
        _openSale(ct, 1e18, 10e18, sid);
        vm.warp(block.timestamp + 8 days);

        vm.expectRevert(TokenSaleEngine.Sale__NotCreator.selector);
        vm.prank(bob);
        engine.claimProceeds(sid);
    }

    function test_sale_claimProceeds_notEnded() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("claimNE");
        _openSale(ct, 1e18, 10e18, sid);

        vm.expectRevert(abi.encodeWithSelector(TokenSaleEngine.Sale__NotEnded.selector, sid));
        vm.prank(alice);
        engine.claimProceeds(sid);
    }

    function test_sale_notCreator_createSale() public {
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("ncCreate");
        vm.expectRevert(TokenSaleEngine.Sale__NotCreator.selector);
        vm.prank(bob);
        engine.createSale(sid, address(ct), 1e18, 10e18, block.timestamp + 1, block.timestamp + 2 days);
    }

    // ═══════════════════════════════════════════════════════════
    // ── CreatorDAO ─────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    function _setupTokenWithHolders() internal returns (CreatorToken ct) {
        ct = _launchAlice();
        bytes32 sid = keccak256("daoSetup");
        _openSale(ct, 1e18, 50_000e18, sid);

        // Bob buys 10_000 tokens (elite tier in off-chain)
        vm.prank(bob);
        gst.approve(address(engine), 10_000e18);
        vm.prank(bob);
        engine.buy(sid, 10_000e18);

        // Carol buys 2_000 tokens
        vm.prank(carol);
        gst.approve(address(engine), 2_000e18);
        vm.prank(carol);
        engine.buy(sid, 2_000e18);
    }

    function test_dao_proposeAndVote() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("prop1");

        vm.prank(bob);
        dao.propose(pid, address(ct), "Add a weekly community event", 3 days);

        // Bob votes FOR
        vm.prank(bob);
        dao.vote(pid, true);

        // Carol votes AGAINST
        vm.prank(carol);
        dao.vote(pid, false);

        (uint256 forVotes, uint256 againstVotes) = dao.tally(pid);
        assertEq(forVotes,     10_000e18);
        assertEq(againstVotes,  2_000e18);
        assertFalse(dao.hasPassed(pid)); // voting still open
    }

    function test_dao_execute() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("prop2");

        vm.prank(bob);
        dao.propose(pid, address(ct), "Expand tokenomics", 1 days);
        vm.prank(bob);
        dao.vote(pid, true);

        // Advance past voting period
        vm.warp(block.timestamp + 2 days);

        assertTrue(dao.hasPassed(pid));
        dao.execute(pid);

        // After execution, hasPassed should still be true and execute reverts on double-exec
        assertTrue(dao.hasPassed(pid));
    }

    function test_dao_wrongChain() public {
        vm.chainId(1);
        vm.expectRevert();
        vm.prank(bob);
        dao.propose(keccak256("bad"), address(0x1), "desc", 1 days);
    }

    function test_dao_noVotingPower() public {
        CreatorToken ct = _setupTokenWithHolders();
        address dave = makeAddr("dave"); // holds zero tokens
        bytes32 pid = keccak256("nvp");

        vm.prank(bob);
        dao.propose(pid, address(ct), "Something", 1 days);

        vm.expectRevert(abi.encodeWithSelector(CreatorDAO.DAO__NoVotingPower.selector, dave));
        vm.prank(dave);
        dao.vote(pid, true);
    }

    function test_dao_doubleVote() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("dv");

        vm.prank(bob);
        dao.propose(pid, address(ct), "Double vote test", 1 days);
        vm.prank(bob);
        dao.vote(pid, true);

        vm.expectRevert(abi.encodeWithSelector(CreatorDAO.DAO__AlreadyVoted.selector, pid, bob));
        vm.prank(bob);
        dao.vote(pid, false);
    }

    function test_dao_votingClosed() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("vc");
        vm.prank(bob);
        dao.propose(pid, address(ct), "Closed vote", 1 days);

        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(abi.encodeWithSelector(CreatorDAO.DAO__VotingClosed.selector, pid));
        vm.prank(bob);
        dao.vote(pid, true);
    }

    function test_dao_executeBeforeEnd() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("ebe");
        vm.prank(bob);
        dao.propose(pid, address(ct), "Early exec", 1 days);

        vm.expectRevert(abi.encodeWithSelector(CreatorDAO.DAO__VotingNotEnded.selector, pid));
        dao.execute(pid);
    }

    function test_dao_doubleExecute() public {
        CreatorToken ct = _setupTokenWithHolders();
        bytes32 pid = keccak256("de");
        vm.prank(bob);
        dao.propose(pid, address(ct), "Double exec", 1 days);
        vm.warp(block.timestamp + 2 days);
        dao.execute(pid);

        vm.expectRevert(abi.encodeWithSelector(CreatorDAO.DAO__AlreadyExecuted.selector, pid));
        dao.execute(pid);
    }

    // ═══════════════════════════════════════════════════════════
    // ── Fuzz ───────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    function testFuzz_buy_amounts(uint96 amount) public {
        vm.assume(amount > 0 && amount <= 100e18);
        CreatorToken ct = _launchAlice();
        bytes32 sid = keccak256("fuzz");
        _openSale(ct, 1e18, 200e18, sid);

        gst.mintTo(bob, uint256(amount) * 2);
        vm.prank(bob);
        gst.approve(address(engine), uint256(amount));
        vm.prank(bob);
        engine.buy(sid, amount);

        assertEq(ct.balanceOf(bob), amount);
    }

    // ── Internal helper to read proposal struct ────────────────────────────────
    struct Proposal {
        address token;
        address proposer;
        string  description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 endsAt;
        bool    executed;
    }
}
