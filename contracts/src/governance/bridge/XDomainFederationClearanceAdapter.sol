// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXDomainMessenger} from "../../common/IXDomainMessenger.sol";

import "../FederatedTimelock.sol";

/// @notice XDomainMessenger-based receiver for L1 constitutional clearance messages.
/// @dev Deployed on GhostL2/GhostL3; it validates the authenticated L1 sender and records clearance into the local
///      FederatedTimelock.
contract XDomainFederationClearanceAdapter {
    IXDomainMessenger public immutable messenger;
    FederatedTimelock public immutable timelock;
    address public immutable authorizedL1Sender;

    error NotMessenger();
    error UnauthorizedL1Sender();

    constructor(IXDomainMessenger messenger_, FederatedTimelock timelock_, address authorizedL1Sender_) {
        require(address(messenger_) != address(0), "messenger=0");
        require(address(timelock_) != address(0), "timelock=0");
        require(authorizedL1Sender_ != address(0), "authorized=0");
        messenger = messenger_;
        timelock = timelock_;
        authorizedL1Sender = authorizedL1Sender_;
    }

    function receiveClearance(bytes32 proposalSalt, bytes32 attestationHash) external {
        if (msg.sender != address(messenger)) revert NotMessenger();
        if (messenger.xDomainMessageSender() != authorizedL1Sender) revert UnauthorizedL1Sender();
        timelock.recordClearance(proposalSalt, attestationHash);
    }
}

