// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXDomainMessenger} from "../../common/IXDomainMessenger.sol";

import "../FederationCouncil.sol";
import "./IFederationBridgeAdapter.sol";
import "./IFederationClearanceSender.sol";

/// @notice XDomainMessenger-based adapter used for federation governance devnets.
/// @dev Deployed on GhostChain L1; receives messages from L2/L3 ProposalAttestor contracts and forwards them to
///      FederationCouncil.recordAttestation. Also sends clearance messages down to the domain.
contract XDomainFederationCouncilAdapter is IFederationBridgeAdapter, IFederationClearanceSender {
    IXDomainMessenger public immutable messenger;
    FederationCouncil public immutable council;
    uint256 public immutable sourceDomainId;

    error NotMessenger();

    constructor(IXDomainMessenger messenger_, FederationCouncil council_, uint256 sourceDomainId_) {
        require(address(messenger_) != address(0), "messenger=0");
        require(address(council_) != address(0), "council=0");
        require(sourceDomainId_ != 0, "domainId=0");
        messenger = messenger_;
        council = council_;
        sourceDomainId = sourceDomainId_;
    }

    function receiveAttestation(bytes32 proposalSalt, bytes32 attestationHash, bytes32 finalityProofHash) external {
        if (msg.sender != address(messenger)) revert NotMessenger();
        address sourceSender = messenger.xDomainMessageSender();
        council.recordAttestation(sourceDomainId, sourceSender, proposalSalt, attestationHash, finalityProofHash);
    }

    function sendClearance(address clearanceTarget, bytes32 proposalSalt, bytes32 attestationHash, uint32 minGasLimit)
        external
    {
        require(msg.sender == address(council), "only council");
        bytes memory msgData = abi.encodeWithSignature(
            "receiveClearance(bytes32,bytes32)", proposalSalt, attestationHash
        );
        messenger.sendMessage(clearanceTarget, msgData, minGasLimit);
    }
}

