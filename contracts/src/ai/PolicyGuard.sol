// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./AIOracleRegistry.sol";
import "./AIAttestationHub.sol";
import "./AIAttestationTypes.sol";

/// @notice Governed policy guard that evaluates AI attestations deterministically.
/// @dev AI signals are advisory by default and cannot unilaterally control actions.
contract PolicyGuard is Governed {
    enum Mode {
        OFF,
        ADVISORY,
        ENFORCE
    }

    struct PolicyEvaluation {
        bool allowed;
        bytes32 reason;
        bytes32 attestationId;
        uint16 riskScoreBps;
        uint8 confidence;
        address signer;
    }

    bytes32 internal constant REASON_OK = keccak256("ghostai.reason.ok");
    bytes32 internal constant REASON_MODE_OFF = keccak256("ghostai.reason.mode.off");
    bytes32 internal constant REASON_BYPASS = keccak256("ghostai.reason.bypass");
    bytes32 internal constant REASON_NO_ATTESTATION = keccak256("ghostai.reason.no_attestation");
    bytes32 internal constant REASON_REVOKED = keccak256("ghostai.reason.revoked");
    bytes32 internal constant REASON_EXPIRED = keccak256("ghostai.reason.expired");
    bytes32 internal constant REASON_STALE = keccak256("ghostai.reason.stale");
    bytes32 internal constant REASON_RISK_TOO_HIGH = keccak256("ghostai.reason.risk_too_high");
    bytes32 internal constant REASON_CONFIDENCE_TOO_LOW = keccak256("ghostai.reason.confidence_too_low");

    bytes32 internal constant POLICY_RISK_THRESHOLD_BPS = keccak256("ghostai.policy.risk.threshold.bps");
    bytes32 internal constant POLICY_MIN_CONFIDENCE = keccak256("ghostai.policy.min.confidence");
    bytes32 internal constant POLICY_MAX_ATTESTATION_AGE = keccak256("ghostai.policy.max.attestation.age");

    uint8 public immutable layerId;

    Mode public mode;
    AIOracleRegistry public registry;
    AIAttestationHub public hub;

    mapping(address => bool) public subjectBypass;
    mapping(bytes32 => bool) public actionBypass;

    event ModeUpdated(Mode mode);
    event RegistryUpdated(address indexed registry);
    event HubUpdated(address indexed hub);
    event SubjectBypassUpdated(address indexed subject, bool bypass);
    event ActionBypassUpdated(bytes32 indexed action, bool bypass);
    event PolicyEvaluated(
        address indexed subject,
        bytes32 indexed action,
        Mode mode,
        bool allowed,
        bytes32 reason,
        bytes32 attestationId,
        uint16 riskScoreBps,
        uint8 confidence,
        address signer
    );

    error GovernanceOnly();
    error PolicyViolation(bytes32 reason);
    error LayerMismatch(uint8 expectedLayer, uint8 providedLayer);

    constructor(
        AIOracleRegistry registry_,
        AIAttestationHub hub_,
        uint8 layerId_,
        address governor_,
        address timelock_
    ) Governed(governor_, timelock_) {
        require(address(registry_) != address(0), "registry=0");
        require(address(hub_) != address(0), "hub=0");
        require(layerId_ >= 1 && layerId_ <= 3, "layer bounds");
        if (hub_.layerId() != layerId_) {
            revert LayerMismatch(layerId_, hub_.layerId());
        }
        registry = registry_;
        hub = hub_;
        layerId = layerId_;
        mode = Mode.OFF;
        emit RegistryUpdated(address(registry_));
        emit HubUpdated(address(hub_));
        emit ModeUpdated(mode);
    }

    function setMode(Mode mode_) external onlyGovernance {
        mode = mode_;
        emit ModeUpdated(mode_);
    }

    function setRegistry(AIOracleRegistry registry_) external onlyGovernance {
        require(address(registry_) != address(0), "registry=0");
        registry = registry_;
        emit RegistryUpdated(address(registry_));
    }

    function setHub(AIAttestationHub hub_) external onlyGovernance {
        require(address(hub_) != address(0), "hub=0");
        if (hub_.layerId() != layerId) {
            revert LayerMismatch(layerId, hub_.layerId());
        }
        hub = hub_;
        emit HubUpdated(address(hub_));
    }

    function setSubjectBypass(address subject, bool bypass) external onlyGovernance {
        subjectBypass[subject] = bypass;
        emit SubjectBypassUpdated(subject, bypass);
    }

    function setActionBypass(bytes32 action, bool bypass) external onlyGovernance {
        actionBypass[action] = bypass;
        emit ActionBypassUpdated(action, bypass);
    }

    /// @notice Pure evaluation API; does not emit events.
    function checkPolicy(address subject, bytes32 action, bytes calldata params)
        external
        view
        returns (bool allowed, bytes32 reason)
    {
        params;
        PolicyEvaluation memory evaluation = _evaluate(subject, action);
        return (evaluation.allowed, evaluation.reason);
    }

    /// @notice Eventful policy evaluation that can enforce based on current mode.
    function enforcePolicy(address subject, bytes32 action, bytes calldata params) external returns (bool allowed) {
        params;
        PolicyEvaluation memory evaluation = _evaluate(subject, action);
        emit PolicyEvaluated(
            subject,
            action,
            mode,
            evaluation.allowed,
            evaluation.reason,
            evaluation.attestationId,
            evaluation.riskScoreBps,
            evaluation.confidence,
            evaluation.signer
        );
        if (mode == Mode.ENFORCE && !evaluation.allowed) {
            revert PolicyViolation(evaluation.reason);
        }
        return evaluation.allowed;
    }

    /// @notice Explicit governance override path.
    function governanceBypass(address subject, bytes32 action, bytes calldata params)
        external
        onlyGovernance
        returns (bool allowed)
    {
        params;
        emit PolicyEvaluated(subject, action, mode, true, REASON_BYPASS, bytes32(0), 0, 0, address(0));
        return true;
    }

    function evaluate(address subject, bytes32 action)
        external
        view
        returns (PolicyEvaluation memory evaluation)
    {
        return _evaluate(subject, action);
    }

    function _evaluate(address subject, bytes32 action) internal view returns (PolicyEvaluation memory evaluation) {
        if (mode == Mode.OFF) {
            evaluation.allowed = true;
            evaluation.reason = REASON_MODE_OFF;
            return evaluation;
        }
        if (subjectBypass[subject] || actionBypass[action]) {
            evaluation.allowed = true;
            evaluation.reason = REASON_BYPASS;
            return evaluation;
        }

        bytes32 attestationId = hub.latestAttestationBySubjectLayer(subject, layerId);
        if (attestationId == bytes32(0)) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_NO_ATTESTATION;
            return evaluation;
        }

        AIAttestationTypes.StoredAttestation memory stored = hub.getAttestation(attestationId);
        evaluation.attestationId = attestationId;
        evaluation.riskScoreBps = stored.attestation.riskScoreBps;
        evaluation.confidence = stored.attestation.confidence;
        evaluation.signer = stored.signer;

        if (stored.revoked) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_REVOKED;
            return evaluation;
        }
        if (stored.attestation.expiresAt <= block.timestamp) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_EXPIRED;
            return evaluation;
        }

        uint256 maxAge = registry.getPolicy(POLICY_MAX_ATTESTATION_AGE);
        if (maxAge > 0 && block.timestamp > stored.attestation.issuedAt + maxAge) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_STALE;
            return evaluation;
        }

        uint256 riskThreshold = registry.getPolicy(POLICY_RISK_THRESHOLD_BPS);
        if (riskThreshold == 0) {
            riskThreshold = 10_000;
        }
        if (stored.attestation.riskScoreBps > riskThreshold) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_RISK_TOO_HIGH;
            return evaluation;
        }

        uint256 minConfidence = registry.getPolicy(POLICY_MIN_CONFIDENCE);
        if (stored.attestation.confidence < minConfidence) {
            evaluation.allowed = mode != Mode.ENFORCE;
            evaluation.reason = REASON_CONFIDENCE_TOO_LOW;
            return evaluation;
        }

        evaluation.allowed = true;
        evaluation.reason = REASON_OK;
    }
}
