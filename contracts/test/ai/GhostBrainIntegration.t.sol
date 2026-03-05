// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import "../../src/ai/GhostBrainIntegration.sol";
import "../../src/ai/AgentRegistry.sol";

/// @title GhostBrainIntegrationTest
/// @notice Foundry tests for the GhostBrainIntegration on-chain anchor contract.
///         Covers Phase 2 (integration contract) and Phase 3 (policy invariants):
///           - Routing-law enforcement (L3→L2→L1 only)
///           - Brand-law enforcement (Ghost/GST/18)
///           - OGB bundle gating (patch requires verified bundle)
///           - Finding / Plan / Patch anchoring lifecycle
///           - Access control (only operator)
contract GhostBrainIntegrationTest is TestBase {

    GhostBrainIntegration private gbi;
    AgentRegistry         private registry;

    address private constant OPERATOR  = address(0xA6E5);
    address private constant ATTACKER  = address(0xBAAD);

    bytes32 private constant SCAN_HASH    = keccak256("scan-result-1");
    bytes32 private constant CORR_ID      = keccak256("corr-1");
    bytes32 private constant BUNDLE_HASH  = keccak256("gov-bundle-1");
    bytes32 private constant PLAN_HASH    = keccak256("plan-1");
    bytes32 private constant PATCH_HASH   = keccak256("diff-1");

    // Local severity constants (avoids consuming vm.prank via external gbi.SEV_* calls)
    uint64 private constant SEV_LOW      = 1;
    uint64 private constant SEV_HIGH     = 3;
    uint64 private constant SEV_CRITICAL = 4;

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        registry = new AgentRegistry(address(this), address(0));
        gbi      = new GhostBrainIntegration(OPERATOR, address(registry));
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    function testConstructorSetsOperator() public view {
        assertEq(gbi.operator(), OPERATOR, "operator mismatch");
    }

    function testConstructorZeroOperatorReverts() public {
        vm.expectRevert(GhostBrainIntegration.ZeroAddress.selector);
        new GhostBrainIntegration(address(0), address(registry));
    }

    // ── Access control ────────────────────────────────────────────────────────

    function testNonOperatorCannotRegisterBundle() public {
        vm.prank(ATTACKER);
        vm.expectRevert(GhostBrainIntegration.Unauthorized.selector);
        gbi.registerVerifiedBundle(BUNDLE_HASH);
    }

    function testNonOperatorCannotAnchorFinding() public {
        vm.prank(ATTACKER);
        vm.expectRevert(GhostBrainIntegration.Unauthorized.selector);
        gbi.anchorFinding(SCAN_HASH, CORR_ID, SEV_HIGH);
    }

    function testSetOperatorTransfersControl() public {
        address newOp = address(0xC0DE);
        vm.prank(OPERATOR);
        gbi.setOperator(newOp);
        assertEq(gbi.operator(), newOp, "operator not updated");
    }

    function testNonOperatorCannotSetOperator() public {
        vm.prank(ATTACKER);
        vm.expectRevert(GhostBrainIntegration.Unauthorized.selector);
        gbi.setOperator(ATTACKER);
    }

    // ── Routing law: valid paths ───────────────────────────────────────────────

    function testRoutingLawL3ToL2() public view {
        // Must not revert
        gbi.checkRoutingLaw(903, 901);
    }

    function testRoutingLawL2ToL1() public view {
        gbi.checkRoutingLaw(901, 14000101);
    }

    // ── Routing law: invalid paths ────────────────────────────────────────────

    function testRoutingLawL3ToL1DirectReverts() public {
        vm.expectRevert();
        gbi.checkRoutingLaw(903, 14000101);
    }

    function testRoutingLawL1ToL3ReverseReverts() public {
        vm.expectRevert();
        gbi.checkRoutingLaw(14000101, 903);
    }

    function testRoutingLawL1ToL2ReverseReverts() public {
        vm.expectRevert();
        gbi.checkRoutingLaw(14000101, 901);
    }

    function testRoutingLawSameChainReverts() public {
        vm.expectRevert();
        gbi.checkRoutingLaw(901, 901);
    }

    function testRoutingLawArbitraryReverts() public {
        vm.expectRevert();
        gbi.checkRoutingLaw(1, 2);
    }

    // ── External egress law ───────────────────────────────────────────────────

    function testExternalEgressFromL1Allowed() public view {
        gbi.checkExternalEgress(14000101);
    }

    function testExternalEgressFromL2Reverts() public {
        vm.expectRevert();
        gbi.checkExternalEgress(901);
    }

    function testExternalEgressFromL3Reverts() public {
        vm.expectRevert();
        gbi.checkExternalEgress(903);
    }

    // ── Brand law: valid ──────────────────────────────────────────────────────

    function testBrandNameGhost() public view {
        gbi.checkBrandName("Ghost");
    }

    function testBrandSymbolGST() public view {
        gbi.checkBrandSymbol("GST");
    }

    function testBrandDecimals18() public view {
        gbi.checkBrandDecimals(18);
    }

    // ── Brand law: invalid ────────────────────────────────────────────────────

    function testBrandNameEthereumReverts() public {
        vm.expectRevert();
        gbi.checkBrandName("Ethereum");
    }

    function testBrandSymbolETHReverts() public {
        vm.expectRevert();
        gbi.checkBrandSymbol("ETH");
    }

    function testBrandDecimalsWrongReverts() public {
        vm.expectRevert();
        gbi.checkBrandDecimals(6);
    }

    // ── Canonical view constants ──────────────────────────────────────────────

    function testCanonicalConstants() public view {
        assertEq(keccak256(bytes(gbi.brandName())),   keccak256(bytes("Ghost")),  "name");
        assertEq(keccak256(bytes(gbi.brandSymbol())), keccak256(bytes("GST")),    "symbol");
        assertEq(uint256(gbi.brandDecimals()),        18,                         "decimals");
        assertEq(gbi.l1ChainId(),                     14000101,                   "L1");
        assertEq(gbi.l2ChainId(),                     901,                        "L2");
        assertEq(gbi.l3ChainId(),                     903,                        "L3");
    }

    // ── Bundle registration ───────────────────────────────────────────────────

    function testRegisterBundle() public {
        assertTrue(!gbi.isBundleVerified(BUNDLE_HASH), "pre-check: should not be verified");
        vm.prank(OPERATOR);
        gbi.registerVerifiedBundle(BUNDLE_HASH);
        assertTrue(gbi.isBundleVerified(BUNDLE_HASH), "post-check: should be verified");
    }

    function testRegisterZeroBundleReverts() public {
        vm.prank(OPERATOR);
        vm.expectRevert(GhostBrainIntegration.ZeroHash.selector);
        gbi.registerVerifiedBundle(bytes32(0));
    }

    // ── Finding lifecycle ─────────────────────────────────────────────────────

    function testAnchorFinding() public {
        assertEq(gbi.findingCount(), 0, "pre-count");
        vm.prank(OPERATOR);
        bytes32 fid = gbi.anchorFinding(SCAN_HASH, CORR_ID, SEV_HIGH);
        assertEq(gbi.findingCount(), 1, "count after");

        GhostBrainIntegration.Finding memory f = gbi.getFinding(fid);
        assertEq(f.scanHash,      SCAN_HASH, "scanHash");
        assertEq(f.correlationId, CORR_ID,   "corrId");
        assertEq(f.severity,      SEV_HIGH,  "severity");
        assertEq(f.reporter,      OPERATOR,  "reporter");
    }

    function testAnchorFindingZeroHashReverts() public {
        vm.prank(OPERATOR);
        vm.expectRevert(GhostBrainIntegration.ZeroHash.selector);
        gbi.anchorFinding(bytes32(0), CORR_ID, SEV_LOW);
    }

    // ── Plan lifecycle ────────────────────────────────────────────────────────

    function testAnchorPlan() public {
        bytes32 findingHash = keccak256("finding-ref");
        assertEq(gbi.planCount(), 0, "pre-count");
        vm.prank(OPERATOR);
        bytes32 pid = gbi.anchorPlan(findingHash, PLAN_HASH, 3);
        assertEq(gbi.planCount(), 1, "post-count");

        GhostBrainIntegration.Plan memory p = gbi.getPlan(pid);
        assertEq(p.findingHash, findingHash, "findingHash");
        assertEq(p.planHash,    PLAN_HASH,   "planHash");
        assertEq(p.stepCount,   3,            "stepCount");
        assertEq(p.planner,     OPERATOR,     "planner");
    }

    function testAnchorPlanZeroHashReverts() public {
        vm.prank(OPERATOR);
        vm.expectRevert(GhostBrainIntegration.ZeroHash.selector);
        gbi.anchorPlan(bytes32(0), bytes32(0), 1);
    }

    // ── Patch lifecycle ───────────────────────────────────────────────────────

    function _registerBundle() internal {
        vm.prank(OPERATOR);
        gbi.registerVerifiedBundle(BUNDLE_HASH);
    }

    function testAnchorPatch() public {
        _registerBundle();
        assertEq(gbi.patchCount(), 0, "pre-count");

        vm.prank(OPERATOR);
        bytes32 pid = gbi.anchorPatch(PLAN_HASH, BUNDLE_HASH, PATCH_HASH, true);
        assertEq(gbi.patchCount(), 1, "post-count");

        GhostBrainIntegration.PatchRecord memory pr = gbi.getPatch(pid);
        assertEq(pr.planHash,   PLAN_HASH,   "planHash");
        assertEq(pr.bundleHash, BUNDLE_HASH, "bundleHash");
        assertEq(pr.patchHash,  PATCH_HASH,  "patchHash");
        assertTrue(pr.applied,             "applied");
        assertEq(pr.executor,   OPERATOR,    "executor");
    }

    function testAnchorPatchRequiresVerifiedBundle() public {
        // bundle NOT registered
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(
            GhostBrainIntegration.BundleNotVerified.selector, BUNDLE_HASH
        ));
        gbi.anchorPatch(PLAN_HASH, BUNDLE_HASH, PATCH_HASH, false);
    }

    function testAnchorPatchZeroHashReverts() public {
        _registerBundle();
        vm.prank(OPERATOR);
        vm.expectRevert(GhostBrainIntegration.ZeroHash.selector);
        gbi.anchorPatch(PLAN_HASH, BUNDLE_HASH, bytes32(0), false);
    }

    function testDryRunPatchRecorded() public {
        _registerBundle();
        vm.prank(OPERATOR);
        bytes32 pid = gbi.anchorPatch(PLAN_HASH, BUNDLE_HASH, PATCH_HASH, false);
        GhostBrainIntegration.PatchRecord memory pr = gbi.getPatch(pid);
        assertTrue(!pr.applied, "dry-run should have applied=false");
    }

    // ── Full lifecycle: finding → plan → patch ────────────────────────────────

    function testFullLifecycle() public {
        // 1. Register bundle
        _registerBundle();

        // 2. Anchor finding
        vm.prank(OPERATOR);
        bytes32 fid = gbi.anchorFinding(SCAN_HASH, CORR_ID, SEV_CRITICAL);

        // 3. Anchor plan referencing finding
        vm.prank(OPERATOR);
        bytes32 pid = gbi.anchorPlan(fid, PLAN_HASH, 2);

        // 4. Anchor patch referencing plan + bundle
        vm.prank(OPERATOR);
        bytes32 prid = gbi.anchorPatch(pid, BUNDLE_HASH, PATCH_HASH, true);

        assertEq(gbi.findingCount(), 1, "findings");
        assertEq(gbi.planCount(),    1, "plans");
        assertEq(gbi.patchCount(),   1, "patches");
        assertTrue(gbi.getPatch(prid).applied, "applied flag");
    }
}
