// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IGhostConstitution {
    function isActionPermitted(bytes32 actionHash) external view returns (bool);
}

/// @notice Governance-gated constitution check helper for upgrades, governance, and AI actions.
contract ConstitutionalGuard is Governed {
    enum ActionType {
        UPGRADE,
        GOVERNANCE,
        AI_COMMAND
    }

    IGhostConstitution public constitution;
    bool public constitutionLocked;

    event ConstitutionSet(address indexed constitution);
    event ConstitutionLocked(address indexed caller);
    event ConstitutionChecked(ActionType indexed actionType, bytes32 indexed actionHash, address indexed actor, bool ok);

    error ConstitutionUnset();
    error ConstitutionBlocked(bytes32 actionHash);

    constructor(address governor_, address timelock_, address constitution_)
        Governed(governor_, timelock_)
    {
        if (constitution_ != address(0)) {
            constitution = IGhostConstitution(constitution_);
            constitutionLocked = true;
            emit ConstitutionSet(constitution_);
            emit ConstitutionLocked(msg.sender);
        }
    }

    function initializeConstitution(address constitution_) external onlyGovernance {
        require(!constitutionLocked, "constitution locked");
        require(constitution_ != address(0), "constitution=0");
        constitution = IGhostConstitution(constitution_);
        constitutionLocked = true;
        emit ConstitutionSet(constitution_);
        emit ConstitutionLocked(msg.sender);
    }

    function checkUpgrade(bytes32 actionHash, address actor, bytes calldata data) external {
        _enforce(ActionType.UPGRADE, actionHash, actor, data);
    }

    function checkGovernance(bytes32 actionHash, address actor, bytes calldata data) external {
        _enforce(ActionType.GOVERNANCE, actionHash, actor, data);
    }

    function checkAICommand(bytes32 actionHash, address actor, bytes calldata data) external {
        _enforce(ActionType.AI_COMMAND, actionHash, actor, data);
    }

    function isPermitted(bytes32 actionHash) external view returns (bool) {
        return _isPermitted(actionHash);
    }

    function _enforce(ActionType actionType, bytes32 actionHash, address actor, bytes calldata data) internal {
        data;
        if (address(constitution) == address(0)) {
            revert ConstitutionUnset();
        }
        bool ok = _isPermitted(actionHash);
        if (!ok) {
            revert ConstitutionBlocked(actionHash);
        }
        emit ConstitutionChecked(actionType, actionHash, actor, ok);
    }

    function _isPermitted(bytes32 actionHash) internal view returns (bool) {
        if (address(constitution) == address(0)) {
            return false;
        }
        return constitution.isActionPermitted(actionHash);
    }
}
