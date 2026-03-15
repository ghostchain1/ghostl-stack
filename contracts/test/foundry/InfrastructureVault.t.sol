// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {InfrastructureVault} from "../../src/l3/infrastructure/InfrastructureVault.sol";
import {GhostBrand}          from "../../src/GhostBrand.sol";

/**
 * @title  InfrastructureVaultTest
 * @notice Foundry tests for InfrastructureVault on GhostL3.
 *
 *         All tests run with vm.chainId(903) set in setUp so chain-guard passes.
 *         Wrong-chain tests spin up their own deploy with a different chainId.
 */
contract InfrastructureVaultTest is Test, GhostBrand {

    // ── Fixtures ──────────────────────────────────────────────────────────────

    address constant ADMIN    = address(0xA01);
    address constant OPERATOR = address(0xA02);
    address constant USER     = address(0xA03);
    address constant NOBODY   = address(0xA04);

    bytes32 constant STREAMING = keccak256("streaming_node");
    bytes32 constant API_NODE  = keccak256("api_node");
    bytes32 constant AI_WORKER = keccak256("ai_worker");
    bytes32 constant UNKNOWN   = keccak256("unknown_type");

    // 0.1 GST per second (in base units)
    uint256 constant RATE_STREAMING = 0.1e18;
    // 0.05 GST per second
    uint256 constant RATE_API       = 0.05e18;
    // 0.08 GST per second
    uint256 constant RATE_AI        = 0.08e18;

    bytes32 constant REGION_US = keccak256("US_EAST");
    bytes32 constant REGION_EU = keccak256("EU_WEST");

    InfrastructureVault vault;

    function setUp() public {
        vm.chainId(L3_CHAIN_ID);               // pin chain to GhostL3

        bytes32[] memory types  = new bytes32[](3);
        uint256[] memory rates  = new uint256[](3);
        types[0] = STREAMING; rates[0] = RATE_STREAMING;
        types[1] = API_NODE;  rates[1] = RATE_API;
        types[2] = AI_WORKER; rates[2] = RATE_AI;

        vault = new InfrastructureVault(ADMIN, types, rates);
    }

    // ── Chain guard ───────────────────────────────────────────────────────────

    function test_infravault_wrongChain_L1_reverts() public {
        vm.chainId(L1_CHAIN_ID);
        bytes32[] memory t = new bytes32[](0);
        uint256[] memory r = new uint256[](0);
        vm.expectRevert(
            abi.encodeWithSelector(
                InfrastructureVault.Vault__WrongChain.selector,
                L1_CHAIN_ID,
                L3_CHAIN_ID
            )
        );
        new InfrastructureVault(ADMIN, t, r);
    }

    function test_infravault_wrongChain_L2_reverts() public {
        vm.chainId(L2_CHAIN_ID);
        bytes32[] memory t = new bytes32[](0);
        uint256[] memory r = new uint256[](0);
        vm.expectRevert(
            abi.encodeWithSelector(
                InfrastructureVault.Vault__WrongChain.selector,
                L2_CHAIN_ID,
                L3_CHAIN_ID
            )
        );
        new InfrastructureVault(ADMIN, t, r);
    }

    function test_infravault_zeroAdmin_reverts() public {
        vm.chainId(L3_CHAIN_ID);
        bytes32[] memory t = new bytes32[](0);
        uint256[] memory r = new uint256[](0);
        // GhostOwnable validates zero-address before the constructor body runs;
        // accept any revert (GhostOwnable__ZeroAddress or Vault__ZeroAddress).
        vm.expectRevert();
        new InfrastructureVault(address(0), t, r);
    }

    // ── Initial state ─────────────────────────────────────────────────────────

    function test_infravault_owner_isAdmin() public view {
        assertEq(vault.owner(), ADMIN);
    }

    function test_infravault_initialRates_set() public view {
        assertEq(vault.costRatePerSecond(STREAMING), RATE_STREAMING);
        assertEq(vault.costRatePerSecond(API_NODE),  RATE_API);
        assertEq(vault.costRatePerSecond(AI_WORKER), RATE_AI);
    }

    function test_infravault_initialTotals_zero() public view {
        assertEq(vault.totalNodesProvisioned(), 0);
        assertEq(vault.totalGSTSpent(),         0);
        assertEq(vault.treasuryGST(),           0);
    }

    // ── Cost rate management ──────────────────────────────────────────────────

    function test_infravault_setCostRate_basic() public {
        uint256 newRate = 0.2e18;
        vm.prank(ADMIN);
        vault.setCostRate(STREAMING, newRate);
        assertEq(vault.costRatePerSecond(STREAMING), newRate);
    }

    function test_infravault_setCostRate_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit InfrastructureVault.CostRateUpdated(STREAMING, RATE_STREAMING, 0.2e18);
        vm.prank(ADMIN);
        vault.setCostRate(STREAMING, 0.2e18);
    }

    function test_infravault_setCostRate_nonOwner_reverts() public {
        vm.prank(NOBODY);
        vm.expectRevert();
        vault.setCostRate(STREAMING, 0.5e18);
    }

    function test_infravault_setCostRate_zeroIsValid() public {
        // Zero rate means "free" node type — not an error
        vm.prank(ADMIN);
        vault.setCostRate(UNKNOWN, 0);
        assertEq(vault.costRatePerSecond(UNKNOWN), 0);
    }

    // ── Operator management ───────────────────────────────────────────────────

    function test_infravault_approveOperator_basic() public {
        vm.prank(ADMIN);
        vault.approveOperator(OPERATOR);
        assertTrue(vault.approvedOperators(OPERATOR));
    }

    function test_infravault_approveOperator_emitsEvent() public {
        vm.expectEmit(true, false, false, false, address(vault));
        emit InfrastructureVault.OperatorApproved(OPERATOR);
        vm.prank(ADMIN);
        vault.approveOperator(OPERATOR);
    }

    function test_infravault_approveOperator_zero_reverts() public {
        vm.prank(ADMIN);
        vm.expectRevert(InfrastructureVault.Vault__ZeroAddress.selector);
        vault.approveOperator(address(0));
    }

    function test_infravault_approveOperator_duplicate_reverts() public {
        vm.startPrank(ADMIN);
        vault.approveOperator(OPERATOR);
        vm.expectRevert(
            abi.encodeWithSelector(InfrastructureVault.Vault__AlreadyApproved.selector, OPERATOR)
        );
        vault.approveOperator(OPERATOR);
        vm.stopPrank();
    }

    function test_infravault_revokeOperator_basic() public {
        vm.startPrank(ADMIN);
        vault.approveOperator(OPERATOR);
        vault.revokeOperator(OPERATOR);
        vm.stopPrank();
        assertFalse(vault.approvedOperators(OPERATOR));
    }

    function test_infravault_revokeOperator_emitsEvent() public {
        vm.startPrank(ADMIN);
        vault.approveOperator(OPERATOR);
        vm.expectEmit(true, false, false, false, address(vault));
        emit InfrastructureVault.OperatorRevoked(OPERATOR);
        vault.revokeOperator(OPERATOR);
        vm.stopPrank();
    }

    function test_infravault_revokeOperator_notApproved_reverts() public {
        vm.prank(ADMIN);
        vm.expectRevert(
            abi.encodeWithSelector(InfrastructureVault.Vault__NotApprovedOperator.selector, OPERATOR)
        );
        vault.revokeOperator(OPERATOR);
    }

    // ── Node provisioning ─────────────────────────────────────────────────────

    function _setupOperator() internal {
        vm.prank(ADMIN);
        vault.approveOperator(OPERATOR);
    }

    function test_infravault_provisionNode_basic() public {
        _setupOperator();
        bytes32 nodeId = keccak256("node-001");
        vm.prank(OPERATOR);
        vault.provisionNode(nodeId, STREAMING, REGION_US, OPERATOR);

        (
            bytes32 nt,
            bytes32 reg,
            address op,
            uint256 ts,
            bool    active
        ) = vault.nodeRecords(nodeId);

        assertEq(nt,     STREAMING);
        assertEq(reg,    REGION_US);
        assertEq(op,     OPERATOR);
        assertTrue(ts > 0);
        assertTrue(active);
    }

    function test_infravault_provisionNode_emitsEvent() public {
        _setupOperator();
        bytes32 nodeId = keccak256("node-002");
        vm.prank(OPERATOR);
        vm.expectEmit(true, true, false, true, address(vault));
        emit InfrastructureVault.NodeProvisioned(nodeId, STREAMING, REGION_US, OPERATOR, block.timestamp);
        vault.provisionNode(nodeId, STREAMING, REGION_US, OPERATOR);
    }

    function test_infravault_provisionNode_incrementsTotal() public {
        _setupOperator();
        vm.startPrank(OPERATOR);
        vault.provisionNode(keccak256("n1"), STREAMING, REGION_US, OPERATOR);
        vault.provisionNode(keccak256("n2"), API_NODE,  REGION_EU, OPERATOR);
        vm.stopPrank();
        assertEq(vault.totalNodesProvisioned(), 2);
    }

    function test_infravault_provisionNode_zeroOperator_reverts() public {
        _setupOperator();
        vm.prank(OPERATOR);
        vm.expectRevert(InfrastructureVault.Vault__ZeroAddress.selector);
        vault.provisionNode(keccak256("n3"), STREAMING, REGION_US, address(0));
    }

    function test_infravault_provisionNode_nonOperator_reverts() public {
        vm.prank(NOBODY);
        vm.expectRevert(
            abi.encodeWithSelector(InfrastructureVault.Vault__NotApprovedOperator.selector, NOBODY)
        );
        vault.provisionNode(keccak256("n4"), STREAMING, REGION_US, NOBODY);
    }

    function test_infravault_ownerCanProvisionWithoutApproval() public {
        bytes32 nodeId = keccak256("node-owner");
        vm.prank(ADMIN);
        vault.provisionNode(nodeId, STREAMING, REGION_US, ADMIN);
        assertTrue(vault.isNodeActive(nodeId));
    }

    // ── Node termination ──────────────────────────────────────────────────────

    function _provisionedNode(bytes32 nodeId) internal {
        _setupOperator();
        vm.prank(OPERATOR);
        vault.provisionNode(nodeId, STREAMING, REGION_US, OPERATOR);
    }

    function test_infravault_terminateNode_basic() public {
        bytes32 nodeId = keccak256("term-001");
        _provisionedNode(nodeId);

        // Fund treasury
        vm.prank(ADMIN);
        vault.depositGST(1000 * GST_UNIT);

        vm.prank(OPERATOR);
        vault.terminateNode(nodeId, 3600); // 1 hour

        assertFalse(vault.isNodeActive(nodeId));
    }

    function test_infravault_terminateNode_emitsTerminatedEvent() public {
        bytes32 nodeId = keccak256("term-002");
        _provisionedNode(nodeId);
        vm.prank(ADMIN);
        vault.depositGST(1000 * GST_UNIT);

        uint256 expectedCost = 3600 * RATE_STREAMING;
        vm.prank(OPERATOR);
        vm.expectEmit(true, false, false, true, address(vault));
        emit InfrastructureVault.NodeTerminated(nodeId, 3600, expectedCost, OPERATOR);
        vault.terminateNode(nodeId, 3600);
    }

    function test_infravault_terminateNode_deductsTreasury() public {
        bytes32 nodeId = keccak256("term-003");
        _provisionedNode(nodeId);
        uint256 initial = 500 * GST_UNIT;
        vm.prank(ADMIN);
        vault.depositGST(initial);

        uint256 expectedCost = 100 * RATE_STREAMING; // 100 seconds
        vm.prank(OPERATOR);
        vault.terminateNode(nodeId, 100);

        assertEq(vault.treasuryGST(),    initial - expectedCost);
        assertEq(vault.totalGSTSpent(),  expectedCost);
    }

    function test_infravault_terminateNode_partialSettlement_treasuryDrained() public {
        bytes32 nodeId = keccak256("term-004");
        _provisionedNode(nodeId);
        // Deposit less than the runtime cost
        vm.prank(ADMIN);
        vault.depositGST(1 * GST_UNIT); // only 1 GST

        vm.prank(OPERATOR);
        // 1-hour termination would cost 360 GST but only 1 is available
        vault.terminateNode(nodeId, 3600);

        // Treasury fully drained, node terminated, no revert
        assertEq(vault.treasuryGST(),   0);
        assertFalse(vault.isNodeActive(nodeId));
    }

    function test_infravault_terminateNode_zeroDuration_reverts() public {
        bytes32 nodeId = keccak256("term-005");
        _provisionedNode(nodeId);
        vm.prank(OPERATOR);
        vm.expectRevert(InfrastructureVault.Vault__ZeroDuration.selector);
        vault.terminateNode(nodeId, 0);
    }

    function test_infravault_terminateNode_unknownType_noRevert() public {
        // Node with unknown type exists (rate = 0) — terminate should succeed silently
        _setupOperator();
        bytes32 nodeId = keccak256("term-unknown");
        vm.prank(OPERATOR);
        vault.provisionNode(nodeId, UNKNOWN, REGION_US, OPERATOR);

        vm.prank(OPERATOR);
        vault.terminateNode(nodeId, 3600); // rate is 0 → cost = 0, no revert
        assertFalse(vault.isNodeActive(nodeId));
        assertEq(vault.totalGSTSpent(), 0);
    }

    // ── Treasury ──────────────────────────────────────────────────────────────

    function test_infravault_depositGST_basic() public {
        vm.prank(ADMIN);
        vault.depositGST(100 * GST_UNIT);
        assertEq(vault.treasuryGST(), 100 * GST_UNIT);
    }

    function test_infravault_depositGST_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit InfrastructureVault.TreasuryDeposited(ADMIN, 50 * GST_UNIT);
        vm.prank(ADMIN);
        vault.depositGST(50 * GST_UNIT);
    }

    function test_infravault_depositGST_zero_reverts() public {
        vm.prank(ADMIN);
        vm.expectRevert(InfrastructureVault.Vault__ZeroAmount.selector);
        vault.depositGST(0);
    }

    function test_infravault_depositGST_nonOwner_reverts() public {
        vm.prank(NOBODY);
        vm.expectRevert();
        vault.depositGST(1 * GST_UNIT);
    }

    function test_infravault_withdrawGST_basic() public {
        vm.startPrank(ADMIN);
        vault.depositGST(200 * GST_UNIT);
        vault.withdrawGST(USER, 50 * GST_UNIT);
        vm.stopPrank();
        assertEq(vault.treasuryGST(), 150 * GST_UNIT);
    }

    function test_infravault_withdrawGST_emitsEvent() public {
        vm.startPrank(ADMIN);
        vault.depositGST(100 * GST_UNIT);
        vm.expectEmit(true, false, false, true, address(vault));
        emit InfrastructureVault.TreasuryWithdrawn(USER, 30 * GST_UNIT);
        vault.withdrawGST(USER, 30 * GST_UNIT);
        vm.stopPrank();
    }

    function test_infravault_withdrawGST_insufficientBalance_reverts() public {
        vm.startPrank(ADMIN);
        vault.depositGST(10 * GST_UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(
                InfrastructureVault.Vault__InsufficientBalance.selector,
                10 * GST_UNIT,
                100 * GST_UNIT
            )
        );
        vault.withdrawGST(USER, 100 * GST_UNIT);
        vm.stopPrank();
    }

    function test_infravault_withdrawGST_zeroAddress_reverts() public {
        vm.startPrank(ADMIN);
        vault.depositGST(10 * GST_UNIT);
        vm.expectRevert(InfrastructureVault.Vault__ZeroAddress.selector);
        vault.withdrawGST(address(0), 5 * GST_UNIT);
        vm.stopPrank();
    }

    function test_infravault_withdrawGST_nonOwner_reverts() public {
        vm.prank(ADMIN);
        vault.depositGST(10 * GST_UNIT);
        vm.prank(NOBODY);
        vm.expectRevert();
        vault.withdrawGST(NOBODY, 5 * GST_UNIT);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function test_infravault_estimateCost() public view {
        uint256 cost = vault.estimateCost(STREAMING, 3600);
        assertEq(cost, 3600 * RATE_STREAMING);
    }

    function test_infravault_estimateCost_unknownType_zero() public view {
        assertEq(vault.estimateCost(UNKNOWN, 3600), 0);
    }

    function test_infravault_isNodeActive_false_before_provision() public view {
        assertFalse(vault.isNodeActive(keccak256("ghost")));
    }

    function test_infravault_multipleNodeTypes_independent() public {
        _setupOperator();
        bytes32 sId = keccak256("streaming-x");
        bytes32 aId = keccak256("api-x");
        bytes32 wId = keccak256("ai-x");

        vm.startPrank(OPERATOR);
        vault.provisionNode(sId, STREAMING, REGION_US, OPERATOR);
        vault.provisionNode(aId, API_NODE,  REGION_EU, OPERATOR);
        vault.provisionNode(wId, AI_WORKER, REGION_US, OPERATOR);
        vm.stopPrank();

        assertEq(vault.totalNodesProvisioned(), 3);

        vm.prank(ADMIN);
        vault.depositGST(10_000 * GST_UNIT);

        uint256 dur = 7200; // 2 hours
        vm.startPrank(OPERATOR);
        vault.terminateNode(sId, dur);
        vault.terminateNode(aId, dur);
        vault.terminateNode(wId, dur);
        vm.stopPrank();

        uint256 expected = dur * (RATE_STREAMING + RATE_API + RATE_AI);
        assertEq(vault.totalGSTSpent(), expected);
        assertFalse(vault.isNodeActive(sId));
        assertFalse(vault.isNodeActive(aId));
        assertFalse(vault.isNodeActive(wId));
    }

    // ── Fuzz tests ────────────────────────────────────────────────────────────

    function testFuzz_infravault_setCostRate(uint256 rate) public {
        vm.prank(ADMIN);
        vault.setCostRate(STREAMING, rate);
        assertEq(vault.costRatePerSecond(STREAMING), rate);
    }

    function testFuzz_infravault_depositAndWithdraw(uint128 deposit, uint128 withdraw) public {
        vm.assume(withdraw <= deposit);
        vm.assume(deposit > 0);
        vm.startPrank(ADMIN);
        vault.depositGST(deposit);
        if (withdraw > 0) vault.withdrawGST(USER, withdraw);
        vm.stopPrank();
        assertEq(vault.treasuryGST(), deposit - withdraw);
    }

    function testFuzz_infravault_estimateCost(uint128 seconds_) public view {
        vm.assume(seconds_ <= type(uint128).max);
        uint256 cost = vault.estimateCost(STREAMING, uint256(seconds_));
        // Should not overflow for any valid seconds value
        assertEq(cost, uint256(seconds_) * RATE_STREAMING);
    }

    function testFuzz_infravault_multipleProvisions(uint8 count) public {
        vm.assume(count > 0 && count <= 20);
        _setupOperator();
        vm.startPrank(OPERATOR);
        for (uint256 i; i < count; ) {
            bytes32 nodeId = keccak256(abi.encodePacked("node", i));
            vault.provisionNode(nodeId, STREAMING, REGION_US, OPERATOR);
            unchecked { ++i; }
        }
        vm.stopPrank();
        assertEq(vault.totalNodesProvisioned(), count);
    }
}
