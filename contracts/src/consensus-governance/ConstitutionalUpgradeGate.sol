// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./ConsensusEvidenceRootStore.sol";

/// @notice Constitutional lock that requires deterministic evidence roots before upgrade authorization.
contract ConstitutionalUpgradeGate is Governed {
    bytes32 public constant KIND_AUDIT_EVIDENCE = keccak256("ghost.upgrade.audit.evidence");
    bytes32 public constant KIND_AI_RISK_SUMMARY = keccak256("ghost.upgrade.ai.risk");
    bytes32 public constant KIND_BUILD_ATTESTATION = keccak256("ghost.upgrade.build.attestation");
    bytes32 public constant KIND_ROLLBACK_PLAN = keccak256("ghost.upgrade.rollback.plan");

    struct UpgradeRequest {
        bytes32 releaseId;
        bytes32 manifestHash;
        bytes32 auditEvidenceRoot;
        bytes32 aiRiskSummaryHash;
        bytes32 buildAttestationRoot;
        bytes32 rollbackPlanHash;
        address proposer;
        uint64 queuedAt;
        uint64 executableAt;
        uint64 authorizedAt;
        bool authorized;
    }

    uint64 public minDelay;
    ConsensusEvidenceRootStore public evidenceRootStore;

    mapping(bytes32 => UpgradeRequest) public requests;

    event MinDelayUpdated(uint64 minDelay);
    event EvidenceRootStoreUpdated(address indexed evidenceRootStore);
    event UpgradeQueued(bytes32 indexed requestId, bytes32 indexed releaseId, bytes32 indexed manifestHash, uint64 executableAt);
    event UpgradeAuthorized(bytes32 indexed requestId, bytes32 indexed releaseId, bytes32 indexed manifestHash, address approver);

    error InvalidRequestField();
    error UnknownEvidenceRoot(bytes32 kind, bytes32 root);
    error UpgradeRequestExists(bytes32 requestId);
    error UpgradeRequestMissing(bytes32 requestId);
    error UpgradeDelayNotElapsed(uint64 executableAt, uint64 currentTimestamp);
    error UpgradeAlreadyAuthorized(bytes32 requestId);

    constructor(address governor_, address timelock_, ConsensusEvidenceRootStore evidenceRootStore_, uint64 minDelay_)
        Governed(governor_, timelock_)
    {
        minDelay = minDelay_;
        evidenceRootStore = evidenceRootStore_;
        emit MinDelayUpdated(minDelay_);
        emit EvidenceRootStoreUpdated(address(evidenceRootStore_));
    }

    function setMinDelay(uint64 minDelay_) external onlyGovernance {
        minDelay = minDelay_;
        emit MinDelayUpdated(minDelay_);
    }

    function setEvidenceRootStore(ConsensusEvidenceRootStore evidenceRootStore_) external onlyGovernance {
        evidenceRootStore = evidenceRootStore_;
        emit EvidenceRootStoreUpdated(address(evidenceRootStore_));
    }

    function queueUpgrade(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 auditEvidenceRoot,
        bytes32 aiRiskSummaryHash,
        bytes32 buildAttestationRoot,
        bytes32 rollbackPlanHash
    ) external onlyGovernance returns (bytes32 requestId, uint64 executableAt) {
        if (
            releaseId == bytes32(0) || manifestHash == bytes32(0) || auditEvidenceRoot == bytes32(0)
                || aiRiskSummaryHash == bytes32(0) || buildAttestationRoot == bytes32(0) || rollbackPlanHash == bytes32(0)
        ) {
            revert InvalidRequestField();
        }

        requestId = computeRequestId(
            releaseId,
            manifestHash,
            auditEvidenceRoot,
            aiRiskSummaryHash,
            buildAttestationRoot,
            rollbackPlanHash
        );

        if (requests[requestId].queuedAt != 0) revert UpgradeRequestExists(requestId);

        _enforceEvidenceRoots(auditEvidenceRoot, aiRiskSummaryHash, buildAttestationRoot, rollbackPlanHash);

        executableAt = uint64(block.timestamp + minDelay);
        requests[requestId] = UpgradeRequest({
            releaseId: releaseId,
            manifestHash: manifestHash,
            auditEvidenceRoot: auditEvidenceRoot,
            aiRiskSummaryHash: aiRiskSummaryHash,
            buildAttestationRoot: buildAttestationRoot,
            rollbackPlanHash: rollbackPlanHash,
            proposer: msg.sender,
            queuedAt: uint64(block.timestamp),
            executableAt: executableAt,
            authorizedAt: 0,
            authorized: false
        });

        emit UpgradeQueued(requestId, releaseId, manifestHash, executableAt);
    }

    function authorizeUpgrade(bytes32 requestId) external onlyGovernance {
        UpgradeRequest storage request = requests[requestId];
        if (request.queuedAt == 0) revert UpgradeRequestMissing(requestId);
        if (request.authorized) revert UpgradeAlreadyAuthorized(requestId);
        if (block.timestamp < request.executableAt) {
            revert UpgradeDelayNotElapsed(request.executableAt, uint64(block.timestamp));
        }

        request.authorized = true;
        request.authorizedAt = uint64(block.timestamp);

        emit UpgradeAuthorized(requestId, request.releaseId, request.manifestHash, msg.sender);
    }

    function isUpgradeAuthorized(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 auditEvidenceRoot,
        bytes32 aiRiskSummaryHash,
        bytes32 buildAttestationRoot,
        bytes32 rollbackPlanHash
    ) external view returns (bool) {
        bytes32 requestId = computeRequestId(
            releaseId,
            manifestHash,
            auditEvidenceRoot,
            aiRiskSummaryHash,
            buildAttestationRoot,
            rollbackPlanHash
        );
        return requests[requestId].authorized;
    }

    function computeRequestId(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 auditEvidenceRoot,
        bytes32 aiRiskSummaryHash,
        bytes32 buildAttestationRoot,
        bytes32 rollbackPlanHash
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                releaseId,
                manifestHash,
                auditEvidenceRoot,
                aiRiskSummaryHash,
                buildAttestationRoot,
                rollbackPlanHash
            )
        );
    }

    function _enforceEvidenceRoots(
        bytes32 auditEvidenceRoot,
        bytes32 aiRiskSummaryHash,
        bytes32 buildAttestationRoot,
        bytes32 rollbackPlanHash
    ) internal view {
        ConsensusEvidenceRootStore store = evidenceRootStore;
        if (address(store) == address(0)) {
            return;
        }
        if (!store.isKnownRoot(KIND_AUDIT_EVIDENCE, auditEvidenceRoot)) {
            revert UnknownEvidenceRoot(KIND_AUDIT_EVIDENCE, auditEvidenceRoot);
        }
        if (!store.isKnownRoot(KIND_AI_RISK_SUMMARY, aiRiskSummaryHash)) {
            revert UnknownEvidenceRoot(KIND_AI_RISK_SUMMARY, aiRiskSummaryHash);
        }
        if (!store.isKnownRoot(KIND_BUILD_ATTESTATION, buildAttestationRoot)) {
            revert UnknownEvidenceRoot(KIND_BUILD_ATTESTATION, buildAttestationRoot);
        }
        if (!store.isKnownRoot(KIND_ROLLBACK_PLAN, rollbackPlanHash)) {
            revert UnknownEvidenceRoot(KIND_ROLLBACK_PLAN, rollbackPlanHash);
        }
    }
}
