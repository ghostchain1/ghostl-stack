// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GhostChainTimelock.sol";

/// @notice Timelock that can require L1 constitutional clearance for a proposal salt (e.g., L2/L3 constitutional actions).
contract FederatedTimelock is GhostChainTimelock {
    address public clearanceAdapter;

    mapping(bytes32 => bool) public constitutionalSalt; // proposalSalt => true
    mapping(bytes32 => bytes32) public clearedAttestationHash; // proposalSalt => attestationHash

    event ClearanceAdapterUpdated(address indexed adapter);
    event ConstitutionalMarked(bytes32 indexed proposalSalt, bool constitutional);
    event ClearanceRecorded(bytes32 indexed proposalSalt, bytes32 attestationHash);

    error ClearanceMissing();
    error NotConstitutional();
    error UnauthorizedClearanceAdapter();
    error ClearanceAlreadyRecorded();

    constructor(address admin, address clearanceAdapter_) GhostChainTimelock(admin) {
        _setClearanceAdapter(clearanceAdapter_);
    }

    function markConstitutional(bytes32 proposalSalt, bool isConstitutional) external onlyRole(DEFAULT_ADMIN_ROLE) {
        constitutionalSalt[proposalSalt] = isConstitutional;
        emit ConstitutionalMarked(proposalSalt, isConstitutional);
    }

    function setClearanceAdapter(address clearanceAdapter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setClearanceAdapter(clearanceAdapter_);
    }

    function recordClearance(bytes32 proposalSalt, bytes32 attestationHash) external {
        if (msg.sender != clearanceAdapter) revert UnauthorizedClearanceAdapter();
        bytes32 existing = clearedAttestationHash[proposalSalt];
        if (existing != bytes32(0) && existing != attestationHash) revert ClearanceAlreadyRecorded();
        clearedAttestationHash[proposalSalt] = attestationHash;
        emit ClearanceRecorded(proposalSalt, attestationHash);
    }

    function executeConstitutional(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 proposalSalt,
        bytes32 attestationHash
    ) external onlyRole(EXECUTOR_ROLE) returns (bytes memory result) {
        if (!constitutionalSalt[proposalSalt]) revert NotConstitutional();
        if (clearedAttestationHash[proposalSalt] != attestationHash) revert ClearanceMissing();
        return execute(target, value, data, proposalSalt);
    }

    function executeBatchConstitutional(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        bytes32 proposalSalt,
        bytes32 attestationHash
    ) external onlyRole(EXECUTOR_ROLE) returns (bytes[] memory results) {
        if (!constitutionalSalt[proposalSalt]) revert NotConstitutional();
        if (clearedAttestationHash[proposalSalt] != attestationHash) revert ClearanceMissing();
        return executeBatch(targets, values, datas, proposalSalt);
    }

    function _setClearanceAdapter(address clearanceAdapter_) internal {
        require(clearanceAdapter_ != address(0), "clearanceAdapter=0");
        clearanceAdapter = clearanceAdapter_;
        emit ClearanceAdapterUpdated(clearanceAdapter_);
    }
}
