// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";

import "../../src/ghostcontract-ai/GhostContractRegistry.sol";
import "../../src/ghostcontract-ai/GhostUpgradeGovernor.sol";
import "../../src/ghostcontract-ai/GhostPolicyGate.sol";
import "../../src/ghostcontract-ai/GhostRiskOracle.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Test: GhostContractRegistry — routing law + deployment management
// ─────────────────────────────────────────────────────────────────────────────
contract GhostContractRegistryTest is TestBase {
    GhostContractRegistry registry;

    uint256 constant L1_CHAIN = 1;
    uint256 constant L2_CHAIN = 10;
    uint256 constant L3_CHAIN = 100;

    address admin    = address(0xA01);
    address deployer = address(0xD01);
    address alice    = address(0x1234);

    function setUp() public {
        vm.prank(admin);
        registry = new GhostContractRegistry(admin, L1_CHAIN, L2_CHAIN, L3_CHAIN);

        vm.prank(admin);
        registry.grantRole(registry.REGISTRAR_ROLE(), deployer);
    }

    // ── Deployment registration ───────────────────────────────────────────

    function testRegisterDeployment() public {
        address contractAddr = address(0xBEEF);
        bytes32 bytecodeHash = keccak256("code");
        bytes32 abiHash      = keccak256("abi");

        vm.prank(deployer);
        bytes32 key = registry.register(
            contractAddr, L2_CHAIN, "MyContract", "1.0.0",
            bytes32(uint256(0xdead)), bytecodeHash, abiHash, "default"
        );

        GhostContractRegistry.Deployment memory d = registry.getDeployment(key);
        assertEq(d.contractAddress, contractAddr, "address mismatch");
        assertEq(d.chainId, L2_CHAIN, "chain mismatch");
        assertTrue(d.active, "not active");
        assertEq(uint256(registry.deploymentCount()), 1, "count");
    }

    function testRegisterUnknownChainReverts() public {
        vm.prank(deployer);
        vm.expectRevert();
        registry.register(address(0x1), 999, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");
    }

    function testRegisterZeroAddressReverts() public {
        vm.prank(deployer);
        vm.expectRevert();
        registry.register(address(0), L1_CHAIN, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");
    }

    function testRegisterDuplicateReverts() public {
        address contractAddr = address(0xBEEF);
        vm.prank(deployer);
        registry.register(contractAddr, L1_CHAIN, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");

        vm.prank(deployer);
        vm.expectRevert();
        registry.register(contractAddr, L1_CHAIN, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");
    }

    function testDeactivate() public {
        address contractAddr = address(0xBEEF);
        vm.prank(deployer);
        bytes32 key = registry.register(contractAddr, L1_CHAIN, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");

        vm.prank(deployer);
        registry.deactivate(key);

        GhostContractRegistry.Deployment memory d = registry.getDeployment(key);
        assertTrue(!d.active, "should be inactive");
    }

    // ── Routing law ───────────────────────────────────────────────────────

    function testRoutingLaw_L3ToL2_Allowed() public {
        // L3→L2 is legal
        vm.prank(deployer);
        registry.registerChainLink(L3_CHAIN, address(0x300), L2_CHAIN, address(0x200));
    }

    function testRoutingLaw_L2ToL1_Allowed() public {
        // L2→L1 is legal
        vm.prank(deployer);
        registry.registerChainLink(L2_CHAIN, address(0x200), L1_CHAIN, address(0x100));
    }

    function testRoutingLaw_L3ToL1_Blocked() public {
        // L3→L1 direct is ILLEGAL
        vm.prank(deployer);
        vm.expectRevert();
        registry.registerChainLink(L3_CHAIN, address(0x300), L1_CHAIN, address(0x100));
    }

    function testRoutingLaw_L2ToL3_Blocked() public {
        // L2→L3 downward link is ILLEGAL
        vm.prank(deployer);
        vm.expectRevert();
        registry.registerChainLink(L2_CHAIN, address(0x200), L3_CHAIN, address(0x300));
    }

    function testRoutingLaw_L1Outbound_Blocked() public {
        // L1 may not be source in registry
        vm.prank(deployer);
        vm.expectRevert();
        registry.registerChainLink(L1_CHAIN, address(0x100), L2_CHAIN, address(0x200));
    }

    function testAssertRoutingLaw_L3ToL2() public view {
        registry.assertRoutingLaw(L3_CHAIN, L2_CHAIN); // must not revert
    }

    function testAssertRoutingLaw_L3ToL1_Reverts() public {
        vm.expectRevert();
        registry.assertRoutingLaw(L3_CHAIN, L1_CHAIN);
    }

    // ── Access control ────────────────────────────────────────────────────

    function testUnauthorizedRegisterReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.register(address(0x1), L1_CHAIN, "X", "1.0", bytes32(0), bytes32(0), bytes32(0), "default");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: GhostUpgradeGovernor — proposal lifecycle, timelock, quarantine
// ─────────────────────────────────────────────────────────────────────────────
contract GhostUpgradeGovernorTest is TestBase {
    GhostUpgradeGovernor governor;

    address admin    = address(0xA01);
    address proposer = address(0xB01);
    address approver1 = address(0xC01);
    address approver2 = address(0xC02);
    address executor = address(0xE01);
    address guardian = address(0xF01);

    uint256 constant L2_CHAIN = 10;

    function setUp() public {
        vm.prank(admin);
        governor = new GhostUpgradeGovernor(admin);

        vm.prank(admin);
        governor.grantRole(governor.PROPOSER_ROLE(), proposer);
        vm.prank(admin);
        governor.grantRole(governor.APPROVER_ROLE(), approver1);
        vm.prank(admin);
        governor.grantRole(governor.APPROVER_ROLE(), approver2);
        vm.prank(admin);
        governor.grantRole(governor.EXECUTOR_ROLE(), executor);
        vm.prank(admin);
        governor.grantRole(governor.GUARDIAN_ROLE(), guardian);

        // short timelock for tests
        vm.prank(admin);
        governor.setTimelockConfig(0, 7 days, 14 days);
    }

    function _propose(uint256 risk, bool emergency) internal returns (bytes32) {
        vm.prank(proposer);
        return governor.propose(
            L2_CHAIN,
            address(0xBEEF),
            address(0xF00D),
            "",
            "Test upgrade",
            keccak256("policy-v1"),
            keccak256("bytecode"),
            bytes32(uint256(0xdead)),
            risk,
            2,
            emergency
        );
    }

    function testProposeAndApprove() public {
        bytes32 id = _propose(30, false);

        vm.prank(approver1);
        governor.approve(id);
        vm.prank(approver2);
        governor.approve(id);

        GhostUpgradeGovernor.UpgradeProposal memory p = governor.getProposal(id);
        assertEq(uint256(p.state), uint256(GhostUpgradeGovernor.ProposalState.Approved), "should be approved");
    }

    function testApproveAndExecute() public {
        bytes32 id = _propose(30, false);
        vm.prank(approver1);
        governor.approve(id);
        vm.prank(approver2);
        governor.approve(id);

        // queue
        governor.queue(id);

        // execute
        vm.prank(executor);
        governor.execute(id, keccak256("policy-v1"));

        GhostUpgradeGovernor.UpgradeProposal memory p = governor.getProposal(id);
        assertEq(uint256(p.state), uint256(GhostUpgradeGovernor.ProposalState.Executed), "should be executed");
    }

    function testPolicyHashMismatchReverts() public {
        bytes32 id = _propose(30, false);
        vm.prank(approver1);
        governor.approve(id);
        vm.prank(approver2);
        governor.approve(id);
        governor.queue(id);

        vm.prank(executor);
        vm.expectRevert();
        governor.execute(id, keccak256("wrong-policy"));
    }

    function testHighRiskQuarantinesProposal() public {
        bytes32 id = _propose(75, false); // >= 70 threshold

        GhostUpgradeGovernor.UpgradeProposal memory p = governor.getProposal(id);
        assertEq(uint256(p.state), uint256(GhostUpgradeGovernor.ProposalState.Quarantined), "should be quarantined");
    }

    function testLiftQuarantine() public {
        bytes32 id = _propose(75, false);

        vm.prank(admin);
        governor.liftQuarantine(id);

        GhostUpgradeGovernor.UpgradeProposal memory p = governor.getProposal(id);
        assertEq(uint256(p.state), uint256(GhostUpgradeGovernor.ProposalState.Pending), "should be pending");
    }

    function testEmergencyPause() public {
        vm.prank(guardian);
        governor.emergencyPause("critical bug detected");

        assertTrue(governor.paused(), "should be paused");

        // propose should fail
        vm.prank(proposer);
        vm.expectRevert();
        _propose(10, false);

        // admin can unpause
        vm.prank(admin);
        governor.emergencyUnpause();
        assertTrue(!governor.paused(), "should be unpaused");
    }

    function testCancelByGuardian() public {
        bytes32 id = _propose(30, false);

        vm.prank(guardian);
        governor.cancel(id);

        GhostUpgradeGovernor.UpgradeProposal memory p = governor.getProposal(id);
        assertEq(uint256(p.state), uint256(GhostUpgradeGovernor.ProposalState.Cancelled), "should be cancelled");
    }

    function testDoubleApproveReverts() public {
        bytes32 id = _propose(30, false);

        vm.prank(approver1);
        governor.approve(id);

        vm.prank(approver1);
        vm.expectRevert();
        governor.approve(id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: GhostPolicyGate — policy commits, gate checks, proofs
// ─────────────────────────────────────────────────────────────────────────────
contract GhostPolicyGateTest is TestBase {
    GhostPolicyGate gate;

    address admin  = address(0xA01);
    address author = address(0xB01);
    address auditor = address(0xC01);

    bytes32 NS = keccak256("ghostcontract-ai.deploy.L2");

    function setUp() public {
        vm.prank(admin);
        gate = new GhostPolicyGate(admin);

        vm.prank(admin);
        gate.grantRole(gate.POLICY_AUTHOR_ROLE(), author);
        vm.prank(admin);
        gate.grantRole(gate.AUDITOR_ROLE(), auditor);
    }

    function testCommitAndVerify() public {
        bytes32 policyHash = keccak256("policy-content-v1");

        vm.prank(author);
        gate.commitPolicy(NS, policyHash, 1, 2, "Standard deploy policy");

        assertTrue(gate.verify(NS, policyHash), "should verify");
        assertTrue(!gate.verify(NS, keccak256("wrong")), "should not verify wrong hash");
    }

    function testCheckAndRecord() public {
        bytes32 policyHash = keccak256("policy-content-v1");
        vm.prank(author);
        gate.commitPolicy(NS, policyHash, 1, 2, "Standard deploy policy");

        bytes32 pipelineId = keccak256("pipeline-001");
        vm.prank(auditor);
        bool passed = gate.checkAndRecord(pipelineId, NS, policyHash);

        assertTrue(passed, "should pass");

        GhostPolicyGate.GateProof memory proof = gate.getGateProof(pipelineId);
        assertEq(proof.presentedHash, policyHash, "hash in proof");
    }

    function testHashMismatchReverts() public {
        bytes32 policyHash = keccak256("policy-content-v1");
        vm.prank(author);
        gate.commitPolicy(NS, policyHash, 1, 2, "Standard deploy policy");

        bytes32 pipelineId = keccak256("pipeline-002");
        vm.prank(auditor);
        vm.expectRevert();
        gate.checkAndRecord(pipelineId, NS, keccak256("wrong-hash"));
    }

    function testDuplicatePipelineReverts() public {
        bytes32 policyHash = keccak256("policy-content-v1");
        vm.prank(author);
        gate.commitPolicy(NS, policyHash, 1, 2, "desc");

        bytes32 pipelineId = keccak256("pipeline-003");
        vm.prank(auditor);
        gate.checkAndRecord(pipelineId, NS, policyHash);

        vm.prank(auditor);
        vm.expectRevert();
        gate.checkAndRecord(pipelineId, NS, policyHash);
    }

    function testRevokePolicy() public {
        bytes32 policyHash = keccak256("policy-content-v1");
        vm.prank(author);
        gate.commitPolicy(NS, policyHash, 1, 2, "desc");

        vm.prank(admin);
        gate.revokePolicy(NS);

        assertTrue(!gate.verify(NS, policyHash), "revoked policy should fail verify");
    }

    function testVersionBumpsOnUpdate() public {
        bytes32 h1 = keccak256("v1");
        bytes32 h2 = keccak256("v2");

        vm.prank(author);
        gate.commitPolicy(NS, h1, 1, 2, "v1 desc");

        vm.prank(author);
        gate.commitPolicy(NS, h2, 1, 2, "v2 desc");

        GhostPolicyGate.Policy memory p = gate.getPolicy(NS);
        assertEq(p.version, 2, "should be version 2");
        assertEq(p.hash, h2, "should be h2");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant: GhostContractRegistry — routing law must never be violated
// ─────────────────────────────────────────────────────────────────────────────
contract GhostContractRegistryInvariant is TestBase {
    GhostContractRegistry registry;
    RegistryActor actor;

    uint256 constant L1_CHAIN = 1;
    uint256 constant L2_CHAIN = 10;
    uint256 constant L3_CHAIN = 100;

    function setUp() public {
        registry = new GhostContractRegistry(address(this), L1_CHAIN, L2_CHAIN, L3_CHAIN);
        registry.grantRole(registry.REGISTRAR_ROLE(), address(this));
        actor = new RegistryActor(registry, L1_CHAIN, L2_CHAIN, L3_CHAIN);
        registry.grantRole(registry.REGISTRAR_ROLE(), address(actor));
    }

    /// @notice Invariant: no chain links stored should violate the routing law.
    function invariant_noIllegalChainLinks() public {
        uint256 count = registry.chainLinkCount();
        for (uint256 i = 0; i < count; i++) {
            (uint256 fromChain,, uint256 toChain,) = _getLink(i);
            uint8 fromLayer = registry.chainLayer(fromChain);
            uint8 toLayer   = registry.chainLayer(toChain);
            // L3 must link to L2 only
            if (fromLayer == 3) {
                assertTrue(toLayer == 2, "invariant: L3 must link to L2 only");
            }
            // L2 must link to L1 only
            if (fromLayer == 2) {
                assertTrue(toLayer == 1, "invariant: L2 must link to L1 only");
            }
        }
    }

    function _getLink(uint256 i) internal view returns (
        uint256 fromChainId, address fromContract,
        uint256 toChainId,   address toContract
    ) {
        (fromChainId, fromContract, toChainId, toContract) =
            (registry.chainLinks(i));
    }
}

/// @dev Fuzzing actor for registry invariant tests.
contract RegistryActor {
    GhostContractRegistry public registry;
    uint256 immutable l1Chain;
    uint256 immutable l2Chain;
    uint256 immutable l3Chain;

    constructor(GhostContractRegistry r, uint256 l1, uint256 l2, uint256 l3) {
        registry = r;
        l1Chain = l1;
        l2Chain = l2;
        l3Chain = l3;
    }

    function addLegalLink(uint8 pair) external {
        uint8 p = pair % 2;
        if (p == 0) {
            try registry.registerChainLink(l3Chain, address(0x300), l2Chain, address(0x200)) {} catch {}
        } else {
            try registry.registerChainLink(l2Chain, address(0x200), l1Chain, address(0x100)) {} catch {}
        }
    }

    function tryIllegalLink(uint8 pair) external {
        uint8 p = pair % 3;
        if (p == 0) {
            // L3→L1 bypass (illegal)
            try registry.registerChainLink(l3Chain, address(0x300), l1Chain, address(0x100)) {} catch {}
        } else if (p == 1) {
            // L2→L3 downward (illegal)
            try registry.registerChainLink(l2Chain, address(0x200), l3Chain, address(0x300)) {} catch {}
        } else {
            // L1 outbound (illegal)
            try registry.registerChainLink(l1Chain, address(0x100), l2Chain, address(0x200)) {} catch {}
        }
    }
}
