// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (test/foundry/GhostOutputOracle.t.sol)
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { GhostOutputOracle } from "../../src/opstack/GhostOutputOracle.sol";

/// @notice Unit tests for GhostOutputOracle — L3→L2 configuration.
///         Tests verify OP Stack ABI compatibility, chain-ID enforcement,
///         finalization logic, and challenger prune semantics.
contract GhostOutputOracleTest is Test {
    // ──────────────────────────────────────────────────────────────────────
    // Fixture
    // ──────────────────────────────────────────────────────────────────────

    GhostOutputOracle internal oracle;

    address internal constant OWNER      = address(0xAA01);
    address internal constant PROPOSER   = address(0xAA02);
    address internal constant CHALLENGER = address(0xAA03);
    address internal constant NOBODY     = address(0xDEAD);

    // L3 → L2 canonical chain IDs
    uint256 internal constant CHILD_ID  = 903;
    uint256 internal constant PARENT_ID = 901;

    uint256 internal constant SUBMISSION_INTERVAL    = 10;   // every 10 L3 blocks
    uint256 internal constant L2_BLOCK_TIME          = 2;    // 2s L3 block time
    uint256 internal constant STARTING_BLOCK_NUMBER  = 0;
    uint256 internal constant STARTING_TIMESTAMP     = 1_700_000_000;
    uint256 internal constant FINALIZATION_PERIOD    = 7 days;

    function setUp() public {
        vm.warp(STARTING_TIMESTAMP);

        oracle = new GhostOutputOracle(
            SUBMISSION_INTERVAL,
            L2_BLOCK_TIME,
            STARTING_BLOCK_NUMBER,
            STARTING_TIMESTAMP,
            PROPOSER,
            CHALLENGER,
            FINALIZATION_PERIOD,
            CHILD_ID,
            PARENT_ID,
            OWNER
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Construction & immutables
    // ──────────────────────────────────────────────────────────────────────

    function test_immutables() public view {
        assertEq(oracle.SUBMISSION_INTERVAL(),         SUBMISSION_INTERVAL);
        assertEq(oracle.L2_BLOCK_TIME(),               L2_BLOCK_TIME);
        assertEq(oracle.STARTING_BLOCK_NUMBER(),       STARTING_BLOCK_NUMBER);
        assertEq(oracle.STARTING_TIMESTAMP(),          STARTING_TIMESTAMP);
        assertEq(oracle.PROPOSER(),                    PROPOSER);
        assertEq(oracle.CHALLENGER(),                  CHALLENGER);
        assertEq(oracle.FINALIZATION_PERIOD_SECONDS(), FINALIZATION_PERIOD);
        assertEq(oracle.CHILD_CHAIN_ID(),              CHILD_ID);
        assertEq(oracle.PARENT_CHAIN_ID(),             PARENT_ID);
        assertEq(oracle.owner(),                       OWNER);
    }

    function test_version() public view {
        assertEq(oracle.version(), "1.0.0-ghost");
    }

    function test_initialState() public view {
        assertEq(oracle.nextOutputIndex(),  0);
        assertEq(oracle.latestBlockNumber(), STARTING_BLOCK_NUMBER);
        assertEq(oracle.nextBlockNumber(),   STARTING_BLOCK_NUMBER);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Chain-ID enforcement
    // ──────────────────────────────────────────────────────────────────────

    function test_rejectsInvalidChainIdPair() public {
        vm.expectRevert("GhostOutputOracle: invalid chain-ID pair");
        new GhostOutputOracle(
            SUBMISSION_INTERVAL,
            L2_BLOCK_TIME,
            STARTING_BLOCK_NUMBER,
            STARTING_TIMESTAMP,
            PROPOSER,
            CHALLENGER,
            FINALIZATION_PERIOD,
            999,      // invalid child
            14000101, // invalid parent for child=999
            OWNER
        );
    }

    function test_acceptsL2ToL1Pair() public {
        // L2→L1 is also a valid chain-ID pair (childChainId=901, parentChainId=14000101)
        GhostOutputOracle l2Oracle = new GhostOutputOracle(
            SUBMISSION_INTERVAL,
            L2_BLOCK_TIME,
            STARTING_BLOCK_NUMBER,
            STARTING_TIMESTAMP,
            PROPOSER,
            CHALLENGER,
            FINALIZATION_PERIOD,
            901,
            14000101,
            OWNER
        );
        assertEq(l2Oracle.CHILD_CHAIN_ID(),  901);
        assertEq(l2Oracle.PARENT_CHAIN_ID(), 14000101);
    }

    // ──────────────────────────────────────────────────────────────────────
    // proposeL2Output
    // ──────────────────────────────────────────────────────────────────────

    // Block 0 = STARTING_BLOCK_NUMBER — warp to the timestamp that block 0 would have
    function _warpToBlock(uint256 blockNum) internal {
        vm.warp(STARTING_TIMESTAMP + blockNum * L2_BLOCK_TIME);
    }

    // nextBlockNumber() = STARTING_BLOCK_NUMBER + (nextOutputIndex() * SUBMISSION_INTERVAL)
    // With STARTING_BLOCK_NUMBER=0:  block 0 → block 10 → block 20 ...
    function _nextExpectedBlock() internal view returns (uint256) {
        return oracle.nextBlockNumber();
    }

    function _propose(uint256 blockNum, bytes32 root) internal {
        vm.prank(PROPOSER);
        oracle.proposeL2Output(root, blockNum, bytes32(0), 0);
    }

    function test_proposeOutput() public {
        // First expected block is STARTING_BLOCK_NUMBER = 0
        uint256 firstBlock = STARTING_BLOCK_NUMBER;
        // setUp already warped to STARTING_TIMESTAMP which matches block 0
        bytes32 root = keccak256("output-0");
        _propose(firstBlock, root);

        assertEq(oracle.nextOutputIndex(),   1);
        assertEq(oracle.latestOutputIndex(), 0);
        assertEq(oracle.latestBlockNumber(), firstBlock);

        GhostOutputOracle.OutputProposal memory p = oracle.getL2Output(0);
        assertEq(p.outputRoot,    root);
        assertEq(p.l2BlockNumber, uint128(firstBlock));
    }

    function test_proposeSecondOutput() public {
        // First at block 0, second at block SUBMISSION_INTERVAL = 10
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        uint256 second = STARTING_BLOCK_NUMBER + SUBMISSION_INTERVAL;
        _warpToBlock(second);
        _propose(second, keccak256("output-1"));

        assertEq(oracle.nextOutputIndex(),   2);
        assertEq(oracle.latestOutputIndex(), 1);
    }

    function test_rejectsNonProposer() public {
        vm.prank(NOBODY);
        vm.expectRevert(GhostOutputOracle.GhostOracle__NotProposer.selector);
        oracle.proposeL2Output(keccak256("x"), STARTING_BLOCK_NUMBER, bytes32(0), 0);
    }

    function test_rejectsWrongBlockNumber() public {
        // Oracle expects block 0; we send block 1 — should revert with (expected=0, got=1)
        vm.prank(PROPOSER);
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostOutputOracle.GhostOracle__TooEarlyToPropose.selector,
                STARTING_BLOCK_NUMBER,
                STARTING_BLOCK_NUMBER + 1
            )
        );
        oracle.proposeL2Output(keccak256("x"), STARTING_BLOCK_NUMBER + 1, bytes32(0), 0);
    }

    function test_rejectsZeroRoot() public {
        vm.prank(PROPOSER);
        vm.expectRevert(GhostOutputOracle.GhostOracle__ZeroOutputRoot.selector);
        oracle.proposeL2Output(bytes32(0), STARTING_BLOCK_NUMBER, bytes32(0), 0);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Finalization
    // ──────────────────────────────────────────────────────────────────────

    function test_notFinalizedWithinPeriod() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));
        // still within finalization period
        assertFalse(oracle.isFinalized(0));
    }

    function test_finalizedAfterPeriod() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));
        vm.warp(block.timestamp + FINALIZATION_PERIOD + 1);
        assertTrue(oracle.isFinalized(0));
    }

    // ──────────────────────────────────────────────────────────────────────
    // deleteL2Outputs (challenger)
    // ──────────────────────────────────────────────────────────────────────

    function test_challengerCanDeleteUnfinalized() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        vm.prank(CHALLENGER);
        oracle.deleteL2Outputs(0);

        assertEq(oracle.nextOutputIndex(), 0);
    }

    function test_nonChallengerCannotDelete() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        vm.prank(NOBODY);
        vm.expectRevert(GhostOutputOracle.GhostOracle__NotChallenger.selector);
        oracle.deleteL2Outputs(0);
    }

    function test_cannotDeleteFinalizedOutput() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));
        vm.warp(block.timestamp + FINALIZATION_PERIOD + 1);

        vm.prank(CHALLENGER);
        vm.expectRevert(GhostOutputOracle.GhostOracle__OutputAlreadyFinalized.selector);
        oracle.deleteL2Outputs(0);
    }

    // ──────────────────────────────────────────────────────────────────────
    // getL2OutputIndexAfter binary search
    // ──────────────────────────────────────────────────────────────────────

    function test_getL2OutputIndexAfter() public {
        // Propose outputs at blocks 0, 10, 20 (STARTING=0, interval=10)
        for (uint256 i = 0; i < 3; i++) {
            uint256 blk = STARTING_BLOCK_NUMBER + i * SUBMISSION_INTERVAL;
            _warpToBlock(blk);
            _propose(blk, keccak256(abi.encode(i)));
        }

        // block 0 is at index 0
        assertEq(oracle.getL2OutputIndexAfter(0), 0);
        // block 1: first output >= 1 is at block 10, returning index 1
        assertEq(oracle.getL2OutputIndexAfter(1), 1);
        // block 10 is at index 1
        assertEq(oracle.getL2OutputIndexAfter(10), 1);
        // block 20 is at index 2
        assertEq(oracle.getL2OutputIndexAfter(20), 2);
    }

    // ──────────────────────────────────────────────────────────────────────
    // computeL2Timestamp
    // ──────────────────────────────────────────────────────────────────────

    function test_computeL2Timestamp() public view {
        assertEq(
            oracle.computeL2Timestamp(SUBMISSION_INTERVAL),
            STARTING_TIMESTAMP + SUBMISSION_INTERVAL * L2_BLOCK_TIME
        );
    }
}

// ════════════════════════════════════════════════════════════════════════════
// L2 → L1 configuration: same suite, different chain-ID pair
// Verifies that the GhostChain branding and all invariants hold when the
// oracle is deployed on GhostChain L1 tracking GhostL2 outputs.
// ════════════════════════════════════════════════════════════════════════════

contract GhostOutputOracleL2Test is Test {
    GhostOutputOracle internal oracle;

    address internal constant OWNER      = address(0xBB01);
    address internal constant PROPOSER   = address(0xBB02);
    address internal constant CHALLENGER = address(0xBB03);
    address internal constant NOBODY     = address(0xDEAD);

    // L2 → L1 canonical chain IDs
    uint256 internal constant CHILD_ID  = 901;
    uint256 internal constant PARENT_ID = 14000101;

    uint256 internal constant SUBMISSION_INTERVAL   = 120; // every 120 L2 blocks (~4 min @ 2s)
    uint256 internal constant L2_BLOCK_TIME         = 2;
    uint256 internal constant STARTING_BLOCK_NUMBER = 0;
    uint256 internal constant STARTING_TIMESTAMP    = 1_700_000_000;
    uint256 internal constant FINALIZATION_PERIOD   = 7 days;

    function setUp() public {
        vm.warp(STARTING_TIMESTAMP);

        oracle = new GhostOutputOracle(
            SUBMISSION_INTERVAL,
            L2_BLOCK_TIME,
            STARTING_BLOCK_NUMBER,
            STARTING_TIMESTAMP,
            PROPOSER,
            CHALLENGER,
            FINALIZATION_PERIOD,
            CHILD_ID,
            PARENT_ID,
            OWNER
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Branding & construction
    // ──────────────────────────────────────────────────────────────────────

    function test_l2_chainIds() public view {
        assertEq(oracle.CHILD_CHAIN_ID(),  CHILD_ID);
        assertEq(oracle.PARENT_CHAIN_ID(), PARENT_ID);
    }

    function test_l2_version() public view {
        assertEq(oracle.version(), "1.0.0-ghost");
    }

    /// @dev L2→L3 pair must be rejected — routing law: L3→L2→L1, not L2→L3.
    function test_l2_rejectsL2ToL3Pair() public {
        vm.expectRevert("GhostOutputOracle: invalid chain-ID pair");
        new GhostOutputOracle(
            SUBMISSION_INTERVAL,
            L2_BLOCK_TIME,
            STARTING_BLOCK_NUMBER,
            STARTING_TIMESTAMP,
            PROPOSER,
            CHALLENGER,
            FINALIZATION_PERIOD,
            901,  // child = L2
            903,  // parent = L3 — invalid: L2 parent must be L1
            OWNER
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Proposal lifecycle
    // ──────────────────────────────────────────────────────────────────────

    function _warpToBlock(uint256 blockNum) internal {
        vm.warp(STARTING_TIMESTAMP + blockNum * L2_BLOCK_TIME);
    }

    function _propose(uint256 blockNum, bytes32 root) internal {
        vm.prank(PROPOSER);
        oracle.proposeL2Output(root, blockNum, bytes32(0), 0);
    }

    function test_l2_proposeAndRetrieve() public {
        bytes32 root = keccak256("l2-output-0");
        _propose(STARTING_BLOCK_NUMBER, root);

        assertEq(oracle.nextOutputIndex(),   1);
        assertEq(oracle.latestOutputIndex(), 0);
        assertEq(oracle.latestBlockNumber(), STARTING_BLOCK_NUMBER);

        GhostOutputOracle.OutputProposal memory p = oracle.getL2Output(0);
        assertEq(p.outputRoot, root);
    }

    function test_l2_nonProposerReverts() public {
        vm.prank(NOBODY);
        vm.expectRevert(GhostOutputOracle.GhostOracle__NotProposer.selector);
        oracle.proposeL2Output(keccak256("x"), STARTING_BLOCK_NUMBER, bytes32(0), 0);
    }

    function test_l2_nextBlockNumberAdvances() public {
        assertEq(oracle.nextBlockNumber(), STARTING_BLOCK_NUMBER);

        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        assertEq(oracle.nextBlockNumber(), STARTING_BLOCK_NUMBER + SUBMISSION_INTERVAL);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Finalization & challenger
    // ──────────────────────────────────────────────────────────────────────

    function test_l2_finalizationWindowHolds() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        assertFalse(oracle.isFinalized(0));
        vm.warp(block.timestamp + FINALIZATION_PERIOD + 1);
        assertTrue(oracle.isFinalized(0));
    }

    function test_l2_challengerDeletesBeforeFinalization() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));

        vm.prank(CHALLENGER);
        oracle.deleteL2Outputs(0);

        assertEq(oracle.nextOutputIndex(), 0);
    }

    function test_l2_cannotDeleteAfterFinalization() public {
        _propose(STARTING_BLOCK_NUMBER, keccak256("output-0"));
        vm.warp(block.timestamp + FINALIZATION_PERIOD + 1);

        vm.prank(CHALLENGER);
        vm.expectRevert(GhostOutputOracle.GhostOracle__OutputAlreadyFinalized.selector);
        oracle.deleteL2Outputs(0);
    }
}
