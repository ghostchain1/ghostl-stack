// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../../common/Governed.sol";
import "../../treasury/TreasuryInvariants.sol";
import "./FederationRegistry.sol";
import "./TreasuryTreaty.sol";

/// @notice Routes federated treasury actions through treaty constraints.
contract FederationRouter is Governed {
    FederationRegistry public registry;
    address public controller;

    event RegistryUpdated(address indexed registry);
    event ControllerUpdated(address indexed controller);
    event TreatyDraw(bytes32 indexed treatyId, uint256 amount, address asset, address recipient);
    event TreatyExitRequested(bytes32 indexed treatyId);
    event TreatyExitFinalized(bytes32 indexed treatyId);

    error NotController();
    error RegistryUnset();
    error TreatyInactive();

    constructor(address governor_, address timelock_, FederationRegistry registry_) Governed(governor_, timelock_) {
        registry = registry_;
        emit RegistryUpdated(address(registry_));
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    function setRegistry(FederationRegistry registry_) external onlyGovernance {
        registry = registry_;
        emit RegistryUpdated(address(registry_));
    }

    function setController(address controller_) external onlyGovernance {
        require(controller_ != address(0), "controller=0");
        TreasuryInvariants.requireContract(controller_);
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function recordDraw(bytes32 treatyId, address asset, address recipient, uint256 amount) external onlyController {
        FederationRegistry registryRef = registry;
        if (address(registryRef) == address(0)) revert RegistryUnset();
        (, address treatyAddress, , bool active,) = registryRef.treaties(treatyId);
        if (!active) revert TreatyInactive();
        TreasuryTreaty treaty = TreasuryTreaty(treatyAddress);
        if (!treaty.canDraw(amount)) revert TreatyInactive();
        treaty.recordDraw(amount, asset, recipient);
        emit TreatyDraw(treatyId, amount, asset, recipient);
    }

    function requestExit(bytes32 treatyId) external onlyController {
        FederationRegistry registryRef = registry;
        if (address(registryRef) == address(0)) revert RegistryUnset();
        (, address treatyAddress, , bool active,) = registryRef.treaties(treatyId);
        if (!active) revert TreatyInactive();
        TreasuryTreaty(treatyAddress).requestExit();
        emit TreatyExitRequested(treatyId);
    }

    function finalizeExit(bytes32 treatyId) external onlyController {
        FederationRegistry registryRef = registry;
        if (address(registryRef) == address(0)) revert RegistryUnset();
        (, address treatyAddress, , bool active,) = registryRef.treaties(treatyId);
        if (!active) revert TreatyInactive();
        TreasuryTreaty(treatyAddress).finalizeExit();
        emit TreatyExitFinalized(treatyId);
    }
}
