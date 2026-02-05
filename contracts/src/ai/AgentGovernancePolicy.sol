// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-locked policy registry for agent actions.
contract AgentGovernancePolicy is Governed {
    struct RolePolicy {
        bytes32 policyHash;
        bool enabled;
        uint64 updatedAt;
    }

    struct ActionPolicy {
        bool enabled;
        uint8 tier;
        uint64 cooldownSeconds;
        uint16 approvalsRequired;
        bool evidenceRequired;
        bytes32 scope;
        bytes32 evidenceHash;
        uint64 updatedAt;
    }

    mapping(bytes32 => RolePolicy) public rolePolicies;
    mapping(bytes32 => mapping(bytes32 => bool)) public actionAllowed;
    mapping(bytes32 => mapping(bytes32 => ActionPolicy)) private actionPolicies;
    mapping(bytes32 => mapping(bytes32 => uint64)) public lastActionAt;
    mapping(address => bool) public executors;

    event RolePolicyUpdated(bytes32 indexed role, bytes32 indexed policyHash, bool enabled);
    event ActionPermissionUpdated(bytes32 indexed role, bytes32 indexed action, bool allowed);
    event ActionPolicyUpdated(bytes32 indexed role, bytes32 indexed action, ActionPolicy policy);
    event ExecutorUpdated(address indexed executor, bool allowed);
    event ActionRecorded(bytes32 indexed role, bytes32 indexed action, address indexed executor, uint64 timestamp);

    error InvalidRole();
    error InvalidPolicy();
    error InvalidTier();
    error UnauthorizedExecutor();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setRolePolicy(bytes32 role, bytes32 policyHash, bool enabled) external onlyGovernance {
        if (role == bytes32(0)) revert InvalidRole();
        if (policyHash == bytes32(0)) revert InvalidPolicy();
        rolePolicies[role] = RolePolicy({policyHash: policyHash, enabled: enabled, updatedAt: uint64(block.timestamp)});
        emit RolePolicyUpdated(role, policyHash, enabled);
    }

    function setActionAllowed(bytes32 role, bytes32 action, bool allowed) external onlyGovernance {
        if (role == bytes32(0)) revert InvalidRole();
        if (action == bytes32(0)) revert InvalidPolicy();
        actionAllowed[role][action] = allowed;
        ActionPolicy storage policy = actionPolicies[role][action];
        policy.enabled = allowed;
        policy.updatedAt = uint64(block.timestamp);
        emit ActionPermissionUpdated(role, action, allowed);
    }

    function setExecutor(address executor, bool allowed) external onlyGovernance {
        if (executor == address(0)) revert InvalidPolicy();
        executors[executor] = allowed;
        emit ExecutorUpdated(executor, allowed);
    }

    function setActionPolicy(
        bytes32 role,
        bytes32 action,
        bool enabled,
        uint8 tier,
        uint64 cooldownSeconds,
        uint16 approvalsRequired,
        bool evidenceRequired,
        bytes32 scope,
        bytes32 evidenceHash
    ) external onlyGovernance {
        if (role == bytes32(0)) revert InvalidRole();
        if (action == bytes32(0)) revert InvalidPolicy();
        if (tier > 3) revert InvalidTier();
        actionAllowed[role][action] = enabled;
        ActionPolicy storage policy = actionPolicies[role][action];
        policy.enabled = enabled;
        policy.tier = tier;
        policy.cooldownSeconds = cooldownSeconds;
        policy.approvalsRequired = approvalsRequired;
        policy.evidenceRequired = evidenceRequired;
        policy.scope = scope;
        policy.evidenceHash = evidenceHash;
        policy.updatedAt = uint64(block.timestamp);
        emit ActionPolicyUpdated(role, action, policy);
    }

    function isActionAllowed(bytes32 role, bytes32 action) external view returns (bool) {
        RolePolicy memory policy = rolePolicies[role];
        if (!policy.enabled) return false;
        ActionPolicy memory actionPolicy = actionPolicies[role][action];
        if (actionPolicy.enabled) return true;
        return actionAllowed[role][action];
    }

    function getActionPolicy(bytes32 role, bytes32 action) external view returns (ActionPolicy memory) {
        return actionPolicies[role][action];
    }

    function canExecute(
        bytes32 role,
        bytes32 action,
        uint16 approvalsProvided,
        bool hasEvidence
    ) external view returns (bool) {
        RolePolicy memory policy = rolePolicies[role];
        if (!policy.enabled) return false;
        ActionPolicy memory actionPolicy = actionPolicies[role][action];
        if (!actionPolicy.enabled) return false;
        if (approvalsProvided < actionPolicy.approvalsRequired) return false;
        if (actionPolicy.evidenceRequired && !hasEvidence) return false;
        uint64 cooldownSeconds = actionPolicy.cooldownSeconds;
        if (cooldownSeconds == 0) return true;
        uint64 lastAt = lastActionAt[role][action];
        if (lastAt == 0) return true;
        return block.timestamp >= lastAt + cooldownSeconds;
    }

    function recordAction(bytes32 role, bytes32 action) external {
        if (!executors[msg.sender] && msg.sender != governor && msg.sender != timelock) revert UnauthorizedExecutor();
        ActionPolicy memory actionPolicy = actionPolicies[role][action];
        if (!actionPolicy.enabled) revert InvalidPolicy();
        uint64 cooldownSeconds = actionPolicy.cooldownSeconds;
        if (cooldownSeconds != 0) {
            uint64 lastAt = lastActionAt[role][action];
            if (lastAt != 0) {
                require(block.timestamp >= lastAt + cooldownSeconds, "cooldown");
            }
        }
        lastActionAt[role][action] = uint64(block.timestamp);
        emit ActionRecorded(role, action, msg.sender, lastActionAt[role][action]);
    }
}
