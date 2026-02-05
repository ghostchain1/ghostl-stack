// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Root constitutional policy registry with activation delays and emergency overrides.
contract PolicyRegistry is Governed {
    struct PolicySetting {
        uint256 min;
        uint256 max;
        uint64 activationDelay;
        uint64 emergencyExpiry;
        uint64 rollbackWindow;
        bool hasBounds;
        bool enabled;
    }

    struct PolicyValue {
        uint256 value;
        uint32 version;
        uint64 updatedAt;
        bytes32 evidenceHash;
    }

    struct PendingPolicy {
        uint256 value;
        uint64 activatesAt;
        bytes32 evidenceHash;
        bool exists;
    }

    struct EmergencyPolicy {
        uint256 value;
        uint64 expiresAt;
        bytes32 evidenceHash;
        bool active;
    }

    bytes32 public immutable constitutionHash;

    mapping(bytes32 => PolicySetting) public policySettings;
    mapping(bytes32 => PolicyValue) private policies;
    mapping(bytes32 => PendingPolicy) private pendingPolicies;
    mapping(bytes32 => EmergencyPolicy) private emergencyPolicies;
    mapping(bytes32 => PolicyValue) private previousPolicies;
    mapping(bytes32 => uint64) public lastActivatedAt;

    event PolicySettingUpdated(
        bytes32 indexed key,
        uint256 min,
        uint256 max,
        uint64 activationDelay,
        uint64 emergencyExpiry,
        uint64 rollbackWindow,
        bool hasBounds,
        bool enabled
    );
    event PolicyQueued(bytes32 indexed key, uint256 value, uint64 activatesAt, bytes32 evidenceHash);
    event PolicyActivated(bytes32 indexed key, uint256 value, uint32 version, bytes32 evidenceHash);
    event PolicyEmergencySet(bytes32 indexed key, uint256 value, uint64 expiresAt, bytes32 evidenceHash);
    event PolicyEmergencyCleared(bytes32 indexed key);
    event PolicyRolledBack(bytes32 indexed key, uint256 value, uint32 version, bytes32 evidenceHash);
    event PolicyCheckpoint(
        bytes32 indexed key,
        uint256 value,
        uint32 version,
        bytes32 evidenceHash,
        uint64 effectiveAt,
        bool emergency,
        bytes32 constitutionHash
    );

    error InvalidPolicyKey();
    error PolicyDisabled();
    error PolicyBounds();
    error PendingPolicyMissing();
    error ActivationNotReady();
    error EmergencyExpired();
    error RollbackUnavailable();

    constructor(address governor_, address timelock_, bytes32 constitutionHash_) Governed(governor_, timelock_) {
        require(constitutionHash_ != bytes32(0), "constitution=0");
        constitutionHash = constitutionHash_;
    }

    function setPolicySetting(
        bytes32 key,
        uint256 min,
        uint256 max,
        uint64 activationDelay,
        uint64 emergencyExpiry,
        uint64 rollbackWindow,
        bool hasBounds,
        bool enabled
    ) external onlyGovernance {
        if (key == bytes32(0)) revert InvalidPolicyKey();
        if (hasBounds && min > max) revert PolicyBounds();
        policySettings[key] = PolicySetting({
            min: min,
            max: max,
            activationDelay: activationDelay,
            emergencyExpiry: emergencyExpiry,
            rollbackWindow: rollbackWindow,
            hasBounds: hasBounds,
            enabled: enabled
        });
        emit PolicySettingUpdated(key, min, max, activationDelay, emergencyExpiry, rollbackWindow, hasBounds, enabled);
    }

    function validatePolicy(bytes32 key, uint256 value) external view returns (bool) {
        PolicySetting memory setting = policySettings[key];
        if (!setting.enabled) return false;
        if (!setting.hasBounds) return true;
        return value >= setting.min && value <= setting.max;
    }

    function queuePolicy(bytes32 key, uint256 value, bytes32 evidenceHash) external onlyGovernance returns (uint64 activatesAt) {
        PolicySetting memory setting = policySettings[key];
        if (!setting.enabled) revert PolicyDisabled();
        _enforceBounds(setting, value);
        activatesAt = uint64(block.timestamp + setting.activationDelay);
        pendingPolicies[key] = PendingPolicy({
            value: value,
            activatesAt: activatesAt,
            evidenceHash: evidenceHash,
            exists: true
        });
        emit PolicyQueued(key, value, activatesAt, evidenceHash);
    }

    function queuePolicyByGovernance(bytes32 key, uint256 value, bytes32 evidenceHash)
        internal
        returns (uint64 activatesAt)
    {
        PolicySetting memory setting = policySettings[key];
        if (!setting.enabled) revert PolicyDisabled();
        _enforceBounds(setting, value);
        activatesAt = uint64(block.timestamp + setting.activationDelay);
        pendingPolicies[key] = PendingPolicy({
            value: value,
            activatesAt: activatesAt,
            evidenceHash: evidenceHash,
            exists: true
        });
        emit PolicyQueued(key, value, activatesAt, evidenceHash);
    }

    function applyPolicy(bytes32 key, uint256 value, bytes32 evidenceHash) external onlyGovernance returns (bool activated) {
        uint64 activatesAt = queuePolicyByGovernance(key, value, evidenceHash);
        if (activatesAt <= uint64(block.timestamp)) {
            _activatePolicy(key);
            return true;
        }
        return false;
    }

    function activatePolicy(bytes32 key) external onlyGovernance {
        _activatePolicy(key);
    }

    function setEmergencyPolicy(bytes32 key, uint256 value, bytes32 evidenceHash) external onlyGovernance {
        PolicySetting memory setting = policySettings[key];
        if (!setting.enabled) revert PolicyDisabled();
        _enforceBounds(setting, value);
        uint64 expiry = setting.emergencyExpiry;
        require(expiry > 0, "emergency expiry=0");
        EmergencyPolicy storage emergency = emergencyPolicies[key];
        emergency.value = value;
        emergency.expiresAt = uint64(block.timestamp + expiry);
        emergency.evidenceHash = evidenceHash;
        emergency.active = true;
        emit PolicyEmergencySet(key, value, emergency.expiresAt, evidenceHash);
        emit PolicyCheckpoint(key, value, policies[key].version, evidenceHash, uint64(block.timestamp), true, constitutionHash);
    }

    function clearEmergencyPolicy(bytes32 key) external onlyGovernance {
        EmergencyPolicy storage emergency = emergencyPolicies[key];
        emergency.active = false;
        emit PolicyEmergencyCleared(key);
    }

    function rollbackPolicy(bytes32 key) external onlyGovernance {
        PolicySetting memory setting = policySettings[key];
        PolicyValue memory previous = previousPolicies[key];
        if (setting.rollbackWindow == 0 || previous.updatedAt == 0) revert RollbackUnavailable();
        if (block.timestamp > lastActivatedAt[key] + setting.rollbackWindow) revert RollbackUnavailable();
        PolicyValue storage current = policies[key];
        policies[key] = PolicyValue({
            value: previous.value,
            version: current.version + 1,
            updatedAt: uint64(block.timestamp),
            evidenceHash: previous.evidenceHash
        });
        emit PolicyRolledBack(key, previous.value, current.version + 1, previous.evidenceHash);
        emit PolicyCheckpoint(key, previous.value, current.version + 1, previous.evidenceHash, uint64(block.timestamp), false, constitutionHash);
    }

    function getPolicy(bytes32 key) external view returns (PolicyValue memory current, PendingPolicy memory pending, EmergencyPolicy memory emergency) {
        return (policies[key], pendingPolicies[key], emergencyPolicies[key]);
    }

    function effectivePolicy(bytes32 key)
        external
        view
        returns (uint256 value, uint32 version, bool emergency, bytes32 evidenceHash, uint64 effectiveAt)
    {
        EmergencyPolicy memory emergencyPolicy = emergencyPolicies[key];
        if (emergencyPolicy.active) {
            if (block.timestamp <= emergencyPolicy.expiresAt) {
                return (
                    emergencyPolicy.value,
                    policies[key].version,
                    true,
                    emergencyPolicy.evidenceHash,
                    emergencyPolicy.expiresAt
                );
            }
        }
        PolicyValue memory current = policies[key];
        return (current.value, current.version, false, current.evidenceHash, current.updatedAt);
    }

    function isEmergencyActive(bytes32 key) external view returns (bool) {
        EmergencyPolicy memory emergency = emergencyPolicies[key];
        if (!emergency.active) return false;
        if (block.timestamp > emergency.expiresAt) return false;
        return true;
    }

    function _activatePolicy(bytes32 key) internal {
        PendingPolicy memory pending = pendingPolicies[key];
        if (!pending.exists) revert PendingPolicyMissing();
        if (block.timestamp < pending.activatesAt) revert ActivationNotReady();
        PolicyValue storage current = policies[key];
        if (current.updatedAt != 0) {
            previousPolicies[key] = current;
        }
        uint32 nextVersion = current.version + 1;
        policies[key] = PolicyValue({
            value: pending.value,
            version: nextVersion,
            updatedAt: uint64(block.timestamp),
            evidenceHash: pending.evidenceHash
        });
        delete pendingPolicies[key];
        lastActivatedAt[key] = uint64(block.timestamp);
        emit PolicyActivated(key, pending.value, nextVersion, pending.evidenceHash);
        emit PolicyCheckpoint(key, pending.value, nextVersion, pending.evidenceHash, uint64(block.timestamp), false, constitutionHash);
    }

    function _enforceBounds(PolicySetting memory setting, uint256 value) internal pure {
        if (setting.hasBounds) {
            if (value < setting.min || value > setting.max) revert PolicyBounds();
        }
    }
}
