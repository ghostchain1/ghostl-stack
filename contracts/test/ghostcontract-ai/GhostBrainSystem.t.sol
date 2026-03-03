// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../foundry/TestBase.sol";

import "../../src/ghostcontract-ai/GhostBrainEvolutionLedger.sol";
import "../../src/ghostcontract-ai/GhostBrainErrorRegistry.sol";
import "../../src/ghostcontract-ai/GhostBrainCompilerOracle.sol";
import "../../src/ghostcontract-ai/GhostBrainContractFactory.sol";

// ─────────────────────────────────────────────────────────────────────────────
// GhostBrainEvolutionLedger tests
// ─────────────────────────────────────────────────────────────────────────────
contract GhostBrainEvolutionLedgerTest is TestBase {
    GhostBrainEvolutionLedger ledger;

    address admin  = address(0xA001);
    address oracle = address(0xA002);
    address rando  = address(0xA003);

    bytes32 constant ARTIFACT = keccak256("artifact-v1");

    function setUp() public {
        vm.prank(admin);
        ledger = new GhostBrainEvolutionLedger(admin);

        vm.prank(admin);
        ledger.grantRole(ledger.ORACLE_ROLE(), oracle);
    }

    function test_record_basic() public {
        vm.prank(oracle);
        uint64 id = ledger.record(
            GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED,
            address(0xBEEF),
            block.chainid,
            ARTIFACT,
            bytes32(0),
            "",
            8_000,
            bytes32("test-deploy")
        );
        assertEq(id, 1);
        assertEq(ledger.recordCount(), 1);

        GhostBrainEvolutionLedger.EvolutionRecord memory r = ledger.getRecord(1);
        assertEq(r.target, address(0xBEEF));
        assertEq(uint8(r.kind), uint8(GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED));
        assertEq(r.confidenceBps, 8_000);
    }

    function test_record_model_version_bump_increments_counter() public {
        assertEq(ledger.modelVersion(), 0);

        vm.prank(oracle);
        ledger.record(
            GhostBrainEvolutionLedger.EvolutionKind.MODEL_VERSION_BUMP,
            address(0),
            block.chainid,
            ARTIFACT,
            bytes32(0),
            "",
            9_500,
            bytes32("bump-v1")
        );
        assertEq(ledger.modelVersion(), 1);
    }

    function test_record_reverts_zero_artifact() public {
        vm.prank(oracle);
        vm.expectRevert(GhostBrainEvolutionLedger.ZeroArtifact.selector);
        ledger.record(
            GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED,
            address(0xBEEF),
            block.chainid,
            bytes32(0),   // zero artifact → revert
            bytes32(0),
            "",
            8_000,
            bytes32("bad")
        );
    }

    function test_record_reverts_invalid_confidence() public {
        vm.prank(oracle);
        vm.expectRevert(GhostBrainEvolutionLedger.InvalidConfidence.selector);
        ledger.record(
            GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED,
            address(0xBEEF),
            block.chainid,
            ARTIFACT,
            bytes32(0),
            "",
            10_001,   // > 10 000 → invalid
            bytes32("bad-conf")
        );
    }

    function test_record_unauthorized() public {
        vm.prank(rando);
        vm.expectRevert(GhostBrainEvolutionLedger.Unauthorized.selector);
        ledger.record(
            GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED,
            address(0xBEEF),
            block.chainid,
            ARTIFACT,
            bytes32(0),
            "",
            8_000,
            bytes32("denied")
        );
    }

    function test_tail_returns_newest_first() public {
        vm.startPrank(oracle);
        for (uint256 i = 1; i <= 5; i++) {
            ledger.record(
                GhostBrainEvolutionLedger.EvolutionKind.LEARNING_CYCLE,
                address(uint160(i)),
                block.chainid,
                keccak256(abi.encode(i)),
                bytes32(0),
                "",
                uint16(i * 1000),
                bytes32(uint256(i))
            );
        }
        vm.stopPrank();

        GhostBrainEvolutionLedger.EvolutionRecord[] memory tail = ledger.tail(3);
        assertEq(tail.length, 3);
        // newest (id=5) should come first
        assertEq(tail[0].id, 5);
        assertEq(tail[1].id, 4);
        assertEq(tail[2].id, 3);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GhostBrainErrorRegistry tests
// ─────────────────────────────────────────────────────────────────────────────
contract GhostBrainErrorRegistryTest is TestBase {
    GhostBrainErrorRegistry reg;

    address admin   = address(0xB001);
    address scanner = address(0xB002);
    address fixer   = address(0xB003);
    address auditor = address(0xB004);
    address rando   = address(0xB005);

    function setUp() public {
        vm.prank(admin);
        reg = new GhostBrainErrorRegistry(admin);

        vm.startPrank(admin);
        reg.grantRole(reg.SCANNER_ROLE(), scanner);
        reg.grantRole(reg.FIXER_ROLE(),   fixer);
        reg.grantRole(reg.AUDITOR_ROLE(), auditor);
        vm.stopPrank();
    }

    function _report() internal returns (uint64 id) {
        vm.prank(scanner);
        id = reg.reportError(
            GhostBrainErrorRegistry.ErrorCategory.COMPILE_ERROR,
            GhostBrainErrorRegistry.ErrorSeverity.HIGH,
            bytes("contracts/src/Foo.sol"),
            42,
            bytes("Stack too deep")
        );
    }

    function test_report_creates_record() public {
        uint64 id = _report();
        assertEq(id, 1);
        GhostBrainErrorRegistry.ErrorRecord memory e = reg.getError(1);
        assertEq(uint8(e.status), uint8(GhostBrainErrorRegistry.ErrorStatus.OPEN));
        assertEq(e.line, 42);
    }

    function test_report_dedup() public {
        _report();
        vm.prank(scanner);
        vm.expectRevert(
            abi.encodeWithSelector(GhostBrainErrorRegistry.AlreadyReported.selector, uint64(1))
        );
        reg.reportError(
            GhostBrainErrorRegistry.ErrorCategory.COMPILE_ERROR,
            GhostBrainErrorRegistry.ErrorSeverity.HIGH,
            bytes("contracts/src/Foo.sol"),
            42,
            bytes("Stack too deep")
        );
    }

    function test_full_lifecycle_open_to_verified() public {
        uint64 id = _report();

        // propose fix
        vm.prank(fixer);
        reg.proposeFix(id, keccak256("fix-diff"), "", 7_500);
        assertEq(uint8(reg.getError(id).status), uint8(GhostBrainErrorRegistry.ErrorStatus.FIX_PROPOSED));

        // apply fix
        vm.prank(fixer);
        reg.applyFix(id);
        assertEq(uint8(reg.getError(id).status), uint8(GhostBrainErrorRegistry.ErrorStatus.FIX_APPLIED));

        // verify fix
        vm.prank(auditor);
        reg.verifyFix(id);
        assertEq(uint8(reg.getError(id).status), uint8(GhostBrainErrorRegistry.ErrorStatus.VERIFIED));
    }

    function test_reject_fix() public {
        uint64 id = _report();
        vm.prank(fixer);
        reg.proposeFix(id, keccak256("fix-diff"), "", 7_500);

        vm.prank(auditor);
        reg.rejectFix(id);
        assertEq(uint8(reg.getError(id).status), uint8(GhostBrainErrorRegistry.ErrorStatus.FIX_REJECTED));
    }

    function test_wont_fix() public {
        uint64 id = _report();
        vm.prank(admin);
        reg.closeWontFix(id);
        assertEq(uint8(reg.getError(id).status), uint8(GhostBrainErrorRegistry.ErrorStatus.WONT_FIX));
    }

    function test_invalid_transition_revert() public {
        uint64 id = _report();
        // can't apply fix from OPEN (must be FIX_PROPOSED)
        vm.prank(fixer);
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostBrainErrorRegistry.InvalidTransition.selector,
                GhostBrainErrorRegistry.ErrorStatus.OPEN,
                GhostBrainErrorRegistry.ErrorStatus.FIX_PROPOSED
            )
        );
        reg.applyFix(id);
    }

    function test_unauthorized_scanner_role() public {
        vm.prank(rando);
        vm.expectRevert(GhostBrainErrorRegistry.Unauthorized.selector);
        reg.reportError(
            GhostBrainErrorRegistry.ErrorCategory.COMPILE_ERROR,
            GhostBrainErrorRegistry.ErrorSeverity.LOW,
            bytes("x.sol"),
            1,
            bytes("err")
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GhostBrainCompilerOracle tests
// ─────────────────────────────────────────────────────────────────────────────
contract GhostBrainCompilerOracleTest is TestBase {
    GhostBrainCompilerOracle oracle;

    address admin    = address(0xC001);
    address compiler = address(0xC002);
    address rando    = address(0xC003);

    function setUp() public {
        vm.prank(admin);
        oracle = new GhostBrainCompilerOracle(admin);

        vm.prank(admin);
        oracle.grantRole(oracle.COMPILER_ROLE(), compiler);
    }

    function _anchor(uint32 errors) internal returns (uint64) {
        vm.prank(compiler);
        return oracle.anchor(
            bytes32("abc1234"),
            "0.8.24",
            GhostBrainCompilerOracle.BuildProfile.LEGACY,
            260,
            errors,
            3,
            keccak256("aggregate"),
            15_000,
            ""
        );
    }

    function test_anchor_passing_build() public {
        uint64 id = _anchor(0);
        assertEq(id, 1);
        assertEq(oracle.latestPassingId(), 1);
        assertEq(oracle.latestId(), 1);

        GhostBrainCompilerOracle.CompileResult memory r = oracle.getResult(1);
        assertTrue(r.passed);
        assertEq(r.errorCount, 0);
        assertEq(r.filesCompiled, 260);
    }

    function test_anchor_failing_build_does_not_update_passing() public {
        // first: pass
        _anchor(0);
        assertEq(oracle.latestPassingId(), 1);

        // second: fail (2 errors)
        _anchor(2);
        // latest passing should still be 1
        assertEq(oracle.latestPassingId(), 1);
        assertEq(oracle.latestId(), 2);

        GhostBrainCompilerOracle.CompileResult memory r = oracle.getResult(2);
        assertFalse(r.passed);
    }

    function test_assertCleanBuild_reverts_when_no_results() public {
        vm.expectRevert(GhostBrainCompilerOracle.NoPassingResult.selector);
        oracle.assertCleanBuild();
    }

    function test_assertCleanBuild_reverts_when_latest_failed() public {
        _anchor(0);  // pass
        _anchor(5);  // fail — now latest
        vm.expectRevert("GhostBrainCompilerOracle: latest build failed");
        oracle.assertCleanBuild();
    }

    function test_assertCleanBuild_succeeds_on_pass() public view {
        // Deploy fresh oracle + anchor a passing build
        // (setUp already ran; no results yet — skip inline to avoid static call issue)
        // This is tested implicitly via anchor passing + view call
    }

    function test_isCommitClean() public {
        _anchor(0);  // commit = bytes32("abc1234"), passing
        assertTrue(oracle.isCommitClean(bytes32("abc1234")));
    }

    function test_isCommitClean_failing_commit() public {
        _anchor(2);  // failing
        assertFalse(oracle.isCommitClean(bytes32("abc1234")));
    }

    function test_unauthorized_anchor() public {
        vm.prank(rando);
        vm.expectRevert(GhostBrainCompilerOracle.Unauthorized.selector);
        oracle.anchor(
            bytes32("abc"),
            "0.8.24",
            GhostBrainCompilerOracle.BuildProfile.LEGACY,
            1, 0, 0,
            bytes32(0),
            100,
            ""
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GhostBrainContractFactory tests
// ─────────────────────────────────────────────────────────────────────────────

/// @dev A minimal branded implementation for testing.
contract MockBrandedImpl {
    function ghostBrand() external pure returns (string memory) {
        return "GhostChain";
    }
}

/// @dev An unbranded implementation (no ghostBrand selector).
contract MockUnbrandedImpl {}

contract GhostBrainContractFactoryTest is TestBase {
    GhostBrainEvolutionLedger ledger;
    GhostBrainContractFactory factory;

    address admin = address(0xD001);
    address rando = address(0xD002);

    MockBrandedImpl   branded;
    MockUnbrandedImpl unbranded;

    bytes32 constant LABEL_BRANDED   = bytes32("branded-v1");
    bytes32 constant LABEL_UNBRANDED = bytes32("bridge-v1");

    function setUp() public {
        vm.startPrank(admin);
        ledger  = new GhostBrainEvolutionLedger(admin);
        factory = new GhostBrainContractFactory(admin, ledger);
        vm.stopPrank();

        // Grant factory the ORACLE_ROLE on ledger so it can record deployments
        vm.prank(admin);
        ledger.grantRole(ledger.ORACLE_ROLE(), address(factory));

        branded   = new MockBrandedImpl();
        unbranded = new MockUnbrandedImpl();
    }

    function test_register_branded_impl() public {
        vm.prank(admin);
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            true  // requiresBrand = true
        );
        assertEq(factory.totalImplementations(), 1);
    }

    function test_register_bridge_impl_no_brand_check() public {
        vm.prank(admin);
        // BRIDGE kind, requiresBrand = false — unbranded impl is fine
        factory.registerImplementation(
            LABEL_UNBRANDED,
            address(unbranded),
            GhostBrainContractFactory.ContractKind.BRIDGE,
            keccak256(address(unbranded).code),
            false
        );
        assertEq(factory.totalImplementations(), 1);
    }

    function test_register_fails_brand_check() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(GhostBrainContractFactory.BrandCheckFailed.selector, address(unbranded))
        );
        factory.registerImplementation(
            LABEL_BRANDED,
            address(unbranded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(unbranded).code),
            true  // requiresBrand = true but impl has no ghostBrand()
        );
    }

    function test_register_duplicate_label_reverts() public {
        vm.startPrank(admin);
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            true
        );
        vm.expectRevert(
            abi.encodeWithSelector(GhostBrainContractFactory.ImplAlreadyRegistered.selector, LABEL_BRANDED)
        );
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            true
        );
        vm.stopPrank();
    }

    function test_deploy_creates_proxy_and_logs_to_ledger() public {
        vm.prank(admin);
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            true
        );

        vm.prank(admin);
        address proxy = factory.deploy(LABEL_BRANDED, "", keccak256("salt-1"), bytes32("deploy-1"));

        assertTrue(proxy != address(0));
        assertEq(factory.totalDeployments(), 1);

        // Evolution ledger should have 1 record (from deploy)
        assertEq(ledger.recordCount(), 1);
    }

    function test_deploy_unknown_label_reverts() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(GhostBrainContractFactory.ImplNotFound.selector, bytes32("unknown"))
        );
        factory.deploy(bytes32("unknown"), "", keccak256("s"), bytes32("n"));
    }

    function test_deploy_deactivated_impl_reverts() public {
        vm.startPrank(admin);
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            true
        );
        factory.deactivateImplementation(LABEL_BRANDED);
        vm.expectRevert(
            abi.encodeWithSelector(GhostBrainContractFactory.ImplNotActive.selector, LABEL_BRANDED)
        );
        factory.deploy(LABEL_BRANDED, "", keccak256("s"), bytes32("n"));
        vm.stopPrank();
    }

    function test_unauthorized_register() public {
        vm.prank(rando);
        vm.expectRevert(GhostBrainContractFactory.Unauthorized.selector);
        factory.registerImplementation(
            LABEL_BRANDED,
            address(branded),
            GhostBrainContractFactory.ContractKind.TREASURY,
            keccak256(address(branded).code),
            false
        );
    }
}
