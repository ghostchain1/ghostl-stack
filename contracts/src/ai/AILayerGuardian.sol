// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AIAttestationBase} from "./AIAttestationBase.sol";
import {IAITransactionGuard} from "./IAITransactionGuard.sol";

/// @notice AI-driven policy engine for a GhostChain layer (L1/L2/L3).
contract AILayerGuardian is AIAttestationBase, IAITransactionGuard {
    enum FraudVerdict {
        UNKNOWN,
        CLEAR,
        FLAG,
        BLOCK
    }

    enum ComplianceDecision {
        UNKNOWN,
        ALLOW,
        DELAY,
        BLOCK
    }

    struct FraudAttestation {
        uint256 nonce;
        uint8 layerId;
        bytes32 operationId;
        uint8 verdict;
        uint32 riskScoreBps;
        bytes32 detailsHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 modelId;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
    }

    struct TxAnalysisAttestation {
        uint256 nonce;
        uint8 layerId;
        bytes32 operationId;
        uint8 category;
        uint8 riskTier;
        bytes32 tagsHash;
        bytes32 detailsHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 modelId;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
    }

    struct ComplianceAttestation {
        uint256 nonce;
        uint8 layerId;
        bytes32 operationId;
        uint8 decision;
        uint64 delaySeconds;
        bytes32 ruleId;
        bytes32 jurisdiction;
        bytes32 detailsHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 modelId;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
    }

    struct ExplainabilityAttestation {
        uint256 nonce;
        uint8 layerId;
        bytes32 operationId;
        bytes32 subjectHash;
        bytes32 uriHash;
        bytes32 summaryHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 modelId;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
    }

    struct FraudAssessment {
        uint8 verdict;
        uint32 riskScoreBps;
        bytes32 detailsHash;
        uint64 assessedAt;
        uint64 validUntil;
        bytes32 attestationHash;
    }

    struct TxAnalysis {
        uint8 category;
        uint8 riskTier;
        bytes32 tagsHash;
        bytes32 detailsHash;
        uint64 analyzedAt;
        uint64 validUntil;
        bytes32 attestationHash;
    }

    struct ComplianceAssessment {
        uint8 decision;
        uint64 delaySeconds;
        bytes32 ruleId;
        bytes32 jurisdiction;
        bytes32 detailsHash;
        uint64 decidedAt;
        uint64 validUntil;
        bytes32 attestationHash;
    }

    struct Explainability {
        bytes32 uriHash;
        bytes32 summaryHash;
        string uri;
        string summary;
        uint64 updatedAt;
        bytes32 attestationHash;
        bytes32 modelId;
    }

    struct ActionPolicy {
        bool enabled;
        bool hasValueBounds;
        uint64 cooldownSeconds;
        uint128 minValue;
        uint128 maxValue;
    }

    bytes32 private constant FRAUD_TYPEHASH =
        keccak256(
            "FraudAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,uint8 verdict,uint32 riskScoreBps,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );
    bytes32 private constant TX_ANALYSIS_TYPEHASH =
        keccak256(
            "TxAnalysisAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,uint8 category,uint8 riskTier,bytes32 tagsHash,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );
    bytes32 private constant COMPLIANCE_TYPEHASH =
        keccak256(
            "ComplianceAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,uint8 decision,uint64 delaySeconds,bytes32 ruleId,bytes32 jurisdiction,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );
    bytes32 private constant EXPLAINABILITY_TYPEHASH =
        keccak256(
            "ExplainabilityAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,bytes32 subjectHash,bytes32 uriHash,bytes32 summaryHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );

    bytes32 public constant REASON_PAUSED = keccak256("PAUSED");
    bytes32 public constant REASON_FRAUD_MISSING = keccak256("FRAUD_MISSING");
    bytes32 public constant REASON_COMPLIANCE_MISSING = keccak256("COMPLIANCE_MISSING");
    bytes32 public constant REASON_FRAUD_BLOCK = keccak256("FRAUD_BLOCK");
    bytes32 public constant REASON_COMPLIANCE_BLOCK = keccak256("COMPLIANCE_BLOCK");
    bytes32 public constant REASON_FRAUD_REVIEW = keccak256("FRAUD_REVIEW");
    bytes32 public constant REASON_COMPLIANCE_DELAY = keccak256("COMPLIANCE_DELAY");

    mapping(bytes32 => FraudAssessment) public fraudAssessments;
    mapping(bytes32 => TxAnalysis) public txAnalyses;
    mapping(bytes32 => ComplianceAssessment) public complianceAssessments;
    mapping(bytes32 => Explainability) public explainabilityByAttestation;
    mapping(address => mapping(bytes4 => ActionPolicy)) public actionPolicies;
    mapping(bytes32 => uint64) public lastActionAt;

    uint32 public fraudReviewThresholdBps = 5000;
    uint32 public fraudBlockThresholdBps = 8000;
    uint64 public defaultReviewDelaySeconds = 15 minutes;
    bool public requireFraudAssessment = true;
    bool public requireComplianceAssessment = true;

    uint8 public immutable layerId;
    uint256 private executionGuard;

    event FraudAssessmentSubmitted(bytes32 indexed operationId, uint8 verdict, uint32 riskScoreBps, bytes32 attestationHash);
    event TxAnalysisSubmitted(bytes32 indexed operationId, uint8 category, uint8 riskTier, bytes32 attestationHash);
    event ComplianceDecisionSubmitted(bytes32 indexed operationId, uint8 decision, uint64 delaySeconds, bytes32 attestationHash);
    event ExplainabilitySubmitted(bytes32 indexed subjectHash, bytes32 attestationHash, bytes32 modelId);
    event RiskThresholdsUpdated(uint32 reviewThresholdBps, uint32 blockThresholdBps, uint64 reviewDelaySeconds);
    event AssessmentRequirementsUpdated(bool requireFraud, bool requireCompliance);
    event ActionPolicyUpdated(address indexed target, bytes4 indexed selector, ActionPolicy policy);
    event ActionExecuted(bytes32 indexed operationId, address indexed actor, address indexed target, bytes4 selector);

    modifier nonReentrant() {
        require(executionGuard == 0, "reentrancy");
        executionGuard = 1;
        _;
        executionGuard = 0;
    }

    constructor(uint8 layerId_) {
        _requireLayer(layerId_);
        layerId = layerId_;
    }

    function computeOperationId(
        address actor,
        address target,
        bytes4 selector,
        bytes calldata data,
        uint256 value
    ) public view override returns (bytes32) {
        return keccak256(abi.encodePacked(layerId, block.chainid, actor, target, selector, keccak256(data), value));
    }

    function setRiskThresholds(
        uint32 reviewThresholdBps,
        uint32 blockThresholdBps,
        uint64 reviewDelaySeconds
    ) external onlyOwner {
        require(reviewThresholdBps <= 10_000, "bad review");
        require(blockThresholdBps <= 10_000, "bad block");
        require(reviewThresholdBps <= blockThresholdBps, "order");
        fraudReviewThresholdBps = reviewThresholdBps;
        fraudBlockThresholdBps = blockThresholdBps;
        defaultReviewDelaySeconds = reviewDelaySeconds;
        emit RiskThresholdsUpdated(reviewThresholdBps, blockThresholdBps, reviewDelaySeconds);
    }

    function setAssessmentRequirements(bool requireFraud, bool requireCompliance) external onlyOwner {
        requireFraudAssessment = requireFraud;
        requireComplianceAssessment = requireCompliance;
        emit AssessmentRequirementsUpdated(requireFraud, requireCompliance);
    }

    function setActionPolicy(
        address target,
        bytes4 selector,
        bool enabled,
        uint64 cooldownSeconds,
        bool hasValueBounds,
        uint128 minValue,
        uint128 maxValue
    ) external onlyOwner {
        ActionPolicy storage policy = actionPolicies[target][selector];
        policy.enabled = enabled;
        policy.cooldownSeconds = cooldownSeconds;
        policy.hasValueBounds = hasValueBounds;
        policy.minValue = minValue;
        policy.maxValue = maxValue;
        emit ActionPolicyUpdated(target, selector, policy);
    }

    function submitFraudAssessment(
        FraudAttestation calldata att,
        bytes[] calldata signatures
    ) external returns (bytes32) {
        _requireLayer(att.layerId);
        require(att.layerId == layerId, "layer mismatch");
        require(att.riskScoreBps <= 10_000, "risk range");
        require(att.verdict <= uint8(FraudVerdict.BLOCK), "bad verdict");
        require(att.verdict != uint8(FraudVerdict.UNKNOWN), "verdict unknown");
        bytes32 structHash = keccak256(abi.encode(FRAUD_TYPEHASH, att));
        AttestationInput memory input = AttestationInput({
            issuedAt: att.issuedAt,
            validUntil: att.validUntil,
            confidenceBps: att.confidenceBps,
            modelId: att.modelId,
            l1Digest: att.l1Digest,
            l2Digest: att.l2Digest,
            l3Digest: att.l3Digest,
            offchainDigest: att.offchainDigest
        });
        bytes32 attestationHash = _validateAttestation(structHash, input, signatures);
        FraudAssessment storage current = fraudAssessments[att.operationId];
        require(att.issuedAt >= current.assessedAt, "older attestation");
        fraudAssessments[att.operationId] = FraudAssessment({
            verdict: att.verdict,
            riskScoreBps: att.riskScoreBps,
            detailsHash: att.detailsHash,
            assessedAt: att.issuedAt,
            validUntil: att.validUntil,
            attestationHash: attestationHash
        });
        emit FraudAssessmentSubmitted(att.operationId, att.verdict, att.riskScoreBps, attestationHash);
        return attestationHash;
    }

    function submitTxAnalysis(
        TxAnalysisAttestation calldata att,
        bytes[] calldata signatures
    ) external returns (bytes32) {
        _requireLayer(att.layerId);
        require(att.layerId == layerId, "layer mismatch");
        bytes32 structHash = keccak256(abi.encode(TX_ANALYSIS_TYPEHASH, att));
        AttestationInput memory input = AttestationInput({
            issuedAt: att.issuedAt,
            validUntil: att.validUntil,
            confidenceBps: att.confidenceBps,
            modelId: att.modelId,
            l1Digest: att.l1Digest,
            l2Digest: att.l2Digest,
            l3Digest: att.l3Digest,
            offchainDigest: att.offchainDigest
        });
        bytes32 attestationHash = _validateAttestation(structHash, input, signatures);
        TxAnalysis storage current = txAnalyses[att.operationId];
        require(att.issuedAt >= current.analyzedAt, "older attestation");
        txAnalyses[att.operationId] = TxAnalysis({
            category: att.category,
            riskTier: att.riskTier,
            tagsHash: att.tagsHash,
            detailsHash: att.detailsHash,
            analyzedAt: att.issuedAt,
            validUntil: att.validUntil,
            attestationHash: attestationHash
        });
        emit TxAnalysisSubmitted(att.operationId, att.category, att.riskTier, attestationHash);
        return attestationHash;
    }

    function submitComplianceDecision(
        ComplianceAttestation calldata att,
        bytes[] calldata signatures
    ) external returns (bytes32) {
        _requireLayer(att.layerId);
        require(att.layerId == layerId, "layer mismatch");
        require(att.decision <= uint8(ComplianceDecision.BLOCK), "bad decision");
        require(att.decision != uint8(ComplianceDecision.UNKNOWN), "decision unknown");
        if (att.decision == uint8(ComplianceDecision.DELAY)) {
            require(att.delaySeconds > 0, "delay=0");
        }
        bytes32 structHash = keccak256(abi.encode(COMPLIANCE_TYPEHASH, att));
        AttestationInput memory input = AttestationInput({
            issuedAt: att.issuedAt,
            validUntil: att.validUntil,
            confidenceBps: att.confidenceBps,
            modelId: att.modelId,
            l1Digest: att.l1Digest,
            l2Digest: att.l2Digest,
            l3Digest: att.l3Digest,
            offchainDigest: att.offchainDigest
        });
        bytes32 attestationHash = _validateAttestation(structHash, input, signatures);
        ComplianceAssessment storage current = complianceAssessments[att.operationId];
        require(att.issuedAt >= current.decidedAt, "older attestation");
        complianceAssessments[att.operationId] = ComplianceAssessment({
            decision: att.decision,
            delaySeconds: att.delaySeconds,
            ruleId: att.ruleId,
            jurisdiction: att.jurisdiction,
            detailsHash: att.detailsHash,
            decidedAt: att.issuedAt,
            validUntil: att.validUntil,
            attestationHash: attestationHash
        });
        emit ComplianceDecisionSubmitted(att.operationId, att.decision, att.delaySeconds, attestationHash);
        return attestationHash;
    }

    function submitExplainability(
        ExplainabilityAttestation calldata att,
        string calldata uri,
        string calldata summary,
        bytes[] calldata signatures
    ) external returns (bytes32) {
        _requireLayer(att.layerId);
        require(att.layerId == layerId, "layer mismatch");
        require(att.subjectHash != bytes32(0), "subject=0");
        require(att.uriHash == keccak256(bytes(uri)), "uri hash");
        require(att.summaryHash == keccak256(bytes(summary)), "summary hash");
        bytes32 structHash = keccak256(abi.encode(EXPLAINABILITY_TYPEHASH, att));
        AttestationInput memory input = AttestationInput({
            issuedAt: att.issuedAt,
            validUntil: att.validUntil,
            confidenceBps: att.confidenceBps,
            modelId: att.modelId,
            l1Digest: att.l1Digest,
            l2Digest: att.l2Digest,
            l3Digest: att.l3Digest,
            offchainDigest: att.offchainDigest
        });
        bytes32 attestationHash = _validateAttestation(structHash, input, signatures);
        explainabilityByAttestation[att.subjectHash] = Explainability({
            uriHash: att.uriHash,
            summaryHash: att.summaryHash,
            uri: uri,
            summary: summary,
            updatedAt: att.issuedAt,
            attestationHash: attestationHash,
            modelId: att.modelId
        });
        emit ExplainabilitySubmitted(att.subjectHash, attestationHash, att.modelId);
        return attestationHash;
    }

    function checkTransaction(
        bytes32 operationId
    ) public view override returns (bool allowed, uint64 waitSeconds, bytes32 reason) {
        if (paused) return (false, 0, REASON_PAUSED);
        FraudAssessment memory fraud = fraudAssessments[operationId];
        ComplianceAssessment memory compliance = complianceAssessments[operationId];
        bool fraudValid = fraud.attestationHash != bytes32(0) && fraud.validUntil >= block.timestamp;
        bool complianceValid = compliance.attestationHash != bytes32(0) && compliance.validUntil >= block.timestamp;
        if (requireFraudAssessment && !fraudValid) {
            return (false, 0, REASON_FRAUD_MISSING);
        }
        if (requireComplianceAssessment && !complianceValid) {
            return (false, 0, REASON_COMPLIANCE_MISSING);
        }
        if (fraudValid && (fraud.verdict == uint8(FraudVerdict.BLOCK) || fraud.riskScoreBps >= fraudBlockThresholdBps)) {
            return (false, 0, REASON_FRAUD_BLOCK);
        }
        if (complianceValid && compliance.decision == uint8(ComplianceDecision.BLOCK)) {
            return (false, 0, REASON_COMPLIANCE_BLOCK);
        }
        if (complianceValid && compliance.decision == uint8(ComplianceDecision.DELAY)) {
            uint64 remaining = _remainingDelay(compliance.decidedAt, compliance.delaySeconds);
            if (remaining > 0) {
                return (false, remaining, REASON_COMPLIANCE_DELAY);
            }
        }
        if (fraudValid && (fraud.verdict == uint8(FraudVerdict.FLAG) || fraud.riskScoreBps >= fraudReviewThresholdBps)) {
            uint64 remaining = _remainingDelay(fraud.assessedAt, defaultReviewDelaySeconds);
            if (remaining > 0) {
                return (false, remaining, REASON_FRAUD_REVIEW);
            }
        }
        return (true, 0, bytes32(0));
    }

    function executeIfAllowed(
        address target,
        bytes4 selector,
        bytes calldata data
    ) external payable nonReentrant returns (bytes32) {
        bytes32 operationId = computeOperationId(msg.sender, target, selector, data, msg.value);
        (bool allowed, uint64 waitSeconds, bytes32 reason) = checkTransaction(operationId);
        if (!allowed) {
            if (waitSeconds > 0) revert("delayed");
            // slither-disable-next-line incorrect-equality
            if (reason == REASON_PAUSED) revert("paused");
            revert("blocked");
        }
        ActionPolicy memory policy = actionPolicies[target][selector];
        require(policy.enabled, "action disabled");
        _enforceCooldown(target, selector, policy.cooldownSeconds);
        _enforceBounds(data, policy);

        bytes memory payload = abi.encodePacked(selector, data);
        (bool ok, ) = target.call{value: msg.value}(payload);
        require(ok, "call failed");
        emit ActionExecuted(operationId, msg.sender, target, selector);
        return operationId;
    }

    function _remainingDelay(uint64 decidedAt, uint64 delaySeconds) internal view returns (uint64) {
        if (delaySeconds == 0) return 0;
        if (block.timestamp <= decidedAt) return delaySeconds;
        uint64 elapsed = uint64(block.timestamp) - decidedAt;
        if (elapsed >= delaySeconds) return 0;
        return delaySeconds - elapsed;
    }

    function _enforceCooldown(address target, bytes4 selector, uint64 cooldownSeconds) internal {
        if (cooldownSeconds == 0) return;
        bytes32 key = keccak256(abi.encodePacked(target, selector));
        uint64 lastAt = lastActionAt[key];
        require(block.timestamp >= lastAt + cooldownSeconds, "cooldown");
        lastActionAt[key] = uint64(block.timestamp);
    }

    function _enforceBounds(bytes calldata data, ActionPolicy memory policy) internal pure {
        if (!policy.hasValueBounds) return;
        require(data.length == 32, "bounds length");
        uint256 value = abi.decode(data, (uint256));
        require(value >= policy.minValue, "below min");
        require(value <= policy.maxValue, "above max");
    }
}
