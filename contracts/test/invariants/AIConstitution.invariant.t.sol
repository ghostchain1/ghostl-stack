// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import "../../src/common/ERC20.sol";
import "../../src/governance/AIConstitutionalProposal.sol";
import "../../src/governance/PolicyRegistry.sol";
import "../../src/governance/EvidenceVault.sol";
import "../../src/governance/AIProposalExecutor.sol";

contract MockGovernanceToken is ERC20 {
    constructor() ERC20("Governance", "GOV", 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockGovernor {
    address public votingToken;

    constructor(address token_) {
        votingToken = token_;
    }
}

contract AIConstitutionInvariantTest is TestBase {
    bytes32 private constant CONSTITUTION_HASH = keccak256("ghost.ai.constitution.v1");
    bytes32 private constant POLICY_KEY = keccak256("ghost.ai.policy.sample");
    bytes32 private constant POLICY_KEY_DELAY = keccak256("ghost.ai.policy.delay");
    bytes32 private constant POLICY_KEY_DISABLED = keccak256("ghost.ai.policy.disabled");
    bytes32 private constant POLICY_KEY_EMERGENCY = keccak256("ghost.ai.policy.emergency");
    bytes32 private constant POLICY_KEY_ROLLBACK = keccak256("ghost.ai.policy.rollback");

    PolicyRegistry private registry;
    EvidenceVault private vault;
    AIProposalExecutor private executor;
    AIConstitutionalProposal private proposal;
    MockGovernanceToken private govToken;
    MockGovernor private governor;

    function setUp() public {
        registry = new PolicyRegistry(address(this), address(0), CONSTITUTION_HASH);
        vault = new EvidenceVault(address(this), address(0), CONSTITUTION_HASH);
        executor = new AIProposalExecutor(address(this), address(0), CONSTITUTION_HASH);

        executor.setPolicyRegistry(registry);
        executor.setEvidenceVault(vault);
        vault.setSubmitter(address(executor), true);
        executor.setMinApprovals(1);
        executor.setSignerSetHash(keccak256("signers"));

        registry.setPolicySetting(POLICY_KEY, 1, 100, 0, 3600, 0, true, true);
        registry.setPolicySetting(POLICY_KEY_DELAY, 1, 100, 3600, 0, 0, true, true);
        registry.setPolicySetting(POLICY_KEY_DISABLED, 0, 0, 0, 0, 0, false, false);
        registry.setPolicySetting(POLICY_KEY_EMERGENCY, 1, 100, 0, 120, 0, true, true);
        registry.setPolicySetting(POLICY_KEY_ROLLBACK, 1, 100, 0, 0, 120, true, true);

        govToken = new MockGovernanceToken();
        govToken.mint(address(this), 1_000_000 ether);
        governor = new MockGovernor(address(govToken));

        proposal = new AIConstitutionalProposal(
            address(governor),
            address(this),
            6667,
            5000,
            1,
            1500,
            keccak256("scope"),
            3600
        );
    }

    function invariant_constitution_hashes_match() public {
        assertEq(registry.constitutionHash(), CONSTITUTION_HASH, "registry hash");
        assertEq(vault.constitutionHash(), CONSTITUTION_HASH, "vault hash");
        assertEq(executor.constitutionHash(), CONSTITUTION_HASH, "executor hash");
    }

    function invariant_forbidden_actions() public {
        assertTrue(proposal.forbiddenAction(proposal.FORBIDDEN_FORK_CHOICE()), "fork choice forbidden");
        assertTrue(proposal.forbiddenAction(proposal.FORBIDDEN_BLOCK_ORDERING()), "block ordering forbidden");
        assertTrue(proposal.forbiddenAction(proposal.FORBIDDEN_FINALITY()), "finality forbidden");
    }

    function test_evidence_requires_auth() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(EvidenceVault.NotAuthorized.selector);
        vault.recordEvidence(bytes32("kind"), bytes32("hash"), POLICY_KEY, 1, 0, bytes32("signers"), 1, bytes32("meta"));

        vm.expectRevert(EvidenceVault.InvalidEvidence.selector);
        vault.recordEvidence(bytes32(0), bytes32("hash"), POLICY_KEY, 1, 0, bytes32("signers"), 1, bytes32("meta"));

        bytes32 recordId =
            vault.recordEvidence(bytes32("kind"), bytes32("hash"), POLICY_KEY, 1, 0, bytes32("signers"), 1, bytes32("meta"));
        assertTrue(vault.recordExists(bytes32("hash")), "evidence recorded");
        EvidenceVault.EvidenceRecord memory rec = vault.getRecord(recordId);
        assertEq(rec.policyKey, POLICY_KEY, "policy key recorded");
    }

    function test_policy_bounds_enforced() public {
        vm.expectRevert(PolicyRegistry.PolicyBounds.selector);
        registry.queuePolicy(POLICY_KEY, 101, bytes32("evidence"));
    }

    function test_policy_disabled_rejected() public {
        vm.expectRevert(PolicyRegistry.PolicyDisabled.selector);
        registry.queuePolicy(POLICY_KEY_DISABLED, 0, bytes32("evidence"));
    }

    function test_activation_delay_enforced() public {
        registry.queuePolicy(POLICY_KEY_DELAY, 10, bytes32("evidence"));
        vm.expectRevert(PolicyRegistry.ActivationNotReady.selector);
        registry.activatePolicy(POLICY_KEY_DELAY);

        vm.warp(block.timestamp + 3600);
        registry.activatePolicy(POLICY_KEY_DELAY);
        (PolicyRegistry.PolicyValue memory current,,) = registry.getPolicy(POLICY_KEY_DELAY);
        assertEq(current.value, 10, "activation value");
    }

    function test_emergency_expiry_enforced() public {
        registry.setEmergencyPolicy(POLICY_KEY_EMERGENCY, 20, bytes32("evidence"));
        assertTrue(registry.isEmergencyActive(POLICY_KEY_EMERGENCY), "emergency active");
        vm.warp(block.timestamp + 121);
        assertTrue(!registry.isEmergencyActive(POLICY_KEY_EMERGENCY), "emergency expired");
    }

    function test_rollback_within_window() public {
        registry.applyPolicy(POLICY_KEY_ROLLBACK, 10, bytes32("ev1"));
        registry.applyPolicy(POLICY_KEY_ROLLBACK, 20, bytes32("ev2"));
        vm.warp(block.timestamp + 60);
        registry.rollbackPolicy(POLICY_KEY_ROLLBACK);
        (PolicyRegistry.PolicyValue memory current,,) = registry.getPolicy(POLICY_KEY_ROLLBACK);
        assertEq(current.value, 10, "rolled back");
    }

    function test_executor_requires_evidence() public {
        AIProposalExecutor.PolicyUpdate memory update = AIProposalExecutor.PolicyUpdate({
            policyKey: POLICY_KEY,
            value: 10,
            evidenceHash: bytes32(0),
            metadataHash: bytes32("meta"),
            nonce: 1,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            emergency: false
        });

        vm.expectRevert(AIProposalExecutor.InvalidUpdate.selector);
        executor.executePolicyUpdate(update, new bytes[](0), bytes32("kind"), 0);
    }

    function test_executor_rejects_stale_update() public {
        AIProposalExecutor.PolicyUpdate memory update = AIProposalExecutor.PolicyUpdate({
            policyKey: POLICY_KEY,
            value: 10,
            evidenceHash: bytes32("evidence"),
            metadataHash: bytes32("meta"),
            nonce: 2,
            issuedAt: uint64(block.timestamp - 31 minutes),
            validUntil: uint64(block.timestamp + 1 hours),
            emergency: false
        });

        vm.expectRevert(AIProposalExecutor.UpdateStale.selector);
        executor.executePolicyUpdate(update, new bytes[](0), bytes32("kind"), 0);
    }

    function test_executor_requires_quorum() public {
        executor.setMinApprovals(2);
        AIProposalExecutor.PolicyUpdate memory update = AIProposalExecutor.PolicyUpdate({
            policyKey: POLICY_KEY,
            value: 10,
            evidenceHash: bytes32("evidence"),
            metadataHash: bytes32("meta"),
            nonce: 3,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            emergency: false
        });

        vm.prank(address(0xBEEF));
        vm.expectRevert(AIProposalExecutor.QuorumNotMet.selector);
        executor.executePolicyUpdate(update, new bytes[](0), bytes32("kind"), 0);
    }
}
