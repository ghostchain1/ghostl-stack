// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library TreasuryTypes {
    enum ActionType {
        TRANSFER,
        CALL,
        REBALANCE,
        FEDERATION,
        FEDERATION_EXIT
    }

    struct Action {
        ActionType actionType;
        address asset;
        address target;
        uint256 amount;
        uint256 value;
        uint256 destinationChainId;
        bytes data;
        bytes32 metadataHash;
        bytes32 aiProposalHash;
        uint256 aiRiskScoreBps;
        bytes32 treatyId;
    }
}
