// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/ConsensusEvidenceRootStore.sol";
import "../../src/consensus-governance/ConstitutionalUpgradeGate.sol";

contract ConstitutionalUpgradeGateTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);

    ConsensusEvidenceRootStore private store;
    ConstitutionalUpgradeGate private gate;

    bytes32 private releaseId = keccak256("release-1");
    bytes32 private manifestHash = keccak256("manifest-v1");
    bytes32 private auditEvidenceRoot = keccak256("audit-root-v1");
    bytes32 private aiRiskSummaryHash = keccak256("ai-risk-v1");
    bytes32 private buildAttestationRoot = keccak256("build-root-v1");
    bytes32 private rollbackPlanHash = keccak256("rollback-v1");
    bytes32 private kindAuditEvidence = keccak256("ghost.upgrade.audit.evidence");
    bytes32 private kindAiRiskSummary = keccak256("ghost.upgrade.ai.risk");
    bytes32 private kindBuildAttestation = keccak256("ghost.upgrade.build.attestation");
    bytes32 private kindRollbackPlan = keccak256("ghost.upgrade.rollback.plan");

    function setUp() public {
        store = new ConsensusEvidenceRootStore(GOVERNOR, TIMELOCK);
        gate = new ConstitutionalUpgradeGate(GOVERNOR, TIMELOCK, store, 1 days);

        vm.prank(GOVERNOR);
        store.recordEvidenceRoot(kindAuditEvidence, auditEvidenceRoot, 0, 0, bytes32(0));
        vm.prank(GOVERNOR);
        store.recordEvidenceRoot(kindAiRiskSummary, aiRiskSummaryHash, 0, 0, bytes32(0));
        vm.prank(GOVERNOR);
        store.recordEvidenceRoot(kindBuildAttestation, buildAttestationRoot, 0, 0, bytes32(0));
        vm.prank(GOVERNOR);
        store.recordEvidenceRoot(kindRollbackPlan, rollbackPlanHash, 0, 0, bytes32(0));
    }

    function testQueueThenAuthorizeAfterDelay() public {
        vm.prank(GOVERNOR);
        (bytes32 requestId, uint64 executableAt) = gate.queueUpgrade(
            releaseId,
            manifestHash,
            auditEvidenceRoot,
            aiRiskSummaryHash,
            buildAttestationRoot,
            rollbackPlanHash
        );

        vm.prank(TIMELOCK);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConstitutionalUpgradeGate.UpgradeDelayNotElapsed.selector, executableAt, uint64(block.timestamp)
            )
        );
        gate.authorizeUpgrade(requestId);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(TIMELOCK);
        gate.authorizeUpgrade(requestId);

        bool authorized = gate.isUpgradeAuthorized(
            releaseId,
            manifestHash,
            auditEvidenceRoot,
            aiRiskSummaryHash,
            buildAttestationRoot,
            rollbackPlanHash
        );
        assertTrue(authorized, "upgrade authorized");
    }

    function testQueueRequiresKnownEvidenceRoots() public {
        bytes32 unknownAudit = keccak256("unknown-audit");

        vm.prank(GOVERNOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConstitutionalUpgradeGate.UnknownEvidenceRoot.selector, kindAuditEvidence, unknownAudit
            )
        );
        gate.queueUpgrade(
            releaseId,
            manifestHash,
            unknownAudit,
            aiRiskSummaryHash,
            buildAttestationRoot,
            rollbackPlanHash
        );
    }
}
