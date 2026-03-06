// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../ZkBatchVerifier.sol";
import "./TreasuryPolicy.sol";
import "./TreasuryReceipts.sol";
import "./TreasuryTypes.sol";
import "./TreasuryInvariants.sol";

/// @notice Fail-closed runtime guard for treasury actions.
contract PolicyViolationGuard is Governed {
    TreasuryPolicy public policy;
    TreasuryReceipts public receipts;
    address public controller;
    bool public enabled = true;
    bool public emergencyFreeze;

    ZkBatchVerifier public zkVerifier;
    uint256 public requiredProofBatchId;
    bytes32 public requiredPolicyRoot;

    event PolicyUpdated(address indexed policy);
    event ReceiptsUpdated(address indexed receipts);
    event ControllerUpdated(address indexed controller);
    event GuardEnabled(bool enabled);
    event EmergencyFreezeSet(bool frozen);
    event ZkVerifierUpdated(address indexed verifier, uint256 batchId, bytes32 policyRoot);

    error NotController();
    error GuardFrozen();
    error GuardDisabled();
    error PolicyUnset();
    error ReceiptsUnset();
    error ZkProofMissing();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    function setPolicy(TreasuryPolicy policy_) external onlyGovernance {
        policy = policy_;
        emit PolicyUpdated(address(policy_));
    }

    function setReceipts(TreasuryReceipts receipts_) external onlyGovernance {
        receipts = receipts_;
        emit ReceiptsUpdated(address(receipts_));
    }

    function setController(address controller_) external onlyGovernance {
        require(controller_ != address(0), "controller=0");
        TreasuryInvariants.requireContract(controller_);
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function setEnabled(bool enabled_) external onlyGovernance {
        enabled = enabled_;
        emit GuardEnabled(enabled_);
    }

    function setEmergencyFreeze(bool frozen) external onlyGovernance {
        emergencyFreeze = frozen;
        emit EmergencyFreezeSet(frozen);
    }

    function setZkVerifier(ZkBatchVerifier verifier, uint256 batchId, bytes32 policyRoot) external onlyGovernance {
        zkVerifier = verifier;
        requiredProofBatchId = batchId;
        requiredPolicyRoot = policyRoot;
        emit ZkVerifierUpdated(address(verifier), batchId, policyRoot);
    }

    function preview(TreasuryTypes.Action calldata action, uint256 vaultBalance)
        external
        view
        returns (uint256 spendAmount, uint256 nextEpochSpent)
    {
        if (address(policy) == address(0)) revert PolicyUnset();
        (spendAmount, nextEpochSpent) = policy.validateAction(action, vaultBalance);
    }

    function enforce(TreasuryTypes.Action calldata action, uint256 vaultBalance)
        external
        view
        onlyController
        returns (bytes32 policyHash, uint256 policyVersion, uint256 spendAmount)
    {
        if (!enabled) revert GuardDisabled();
        if (emergencyFreeze) revert GuardFrozen();
        TreasuryPolicy policyRef = policy;
        if (address(policyRef) == address(0)) revert PolicyUnset();
        if (address(receipts) == address(0)) revert ReceiptsUnset();

        (spendAmount, ) = policyRef.validateAction(action, vaultBalance);
        policyHash = policyRef.policyHash();
        policyVersion = policyRef.policyVersion();

        if (address(zkVerifier) != address(0) && requiredPolicyRoot != bytes32(0)) {
            bytes32 root = zkVerifier.verifiedRoot(requiredProofBatchId);
            if (root != requiredPolicyRoot) revert ZkProofMissing();
        }

        if (spendAmount > 0) {
            TreasuryInvariants.assertReserveInvariant(vaultBalance - spendAmount, policyRef.minReserve());
        }
    }
}
