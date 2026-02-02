// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./TreasuryTypes.sol";
import "./TreasuryInvariants.sol";

/// @notice Emits evidence-grade receipts for treasury actions.
contract TreasuryReceipts is Governed {
    address public controller;
    bool public controllerLocked;

    struct Receipt {
        bytes32 receiptId;
        bytes32 actionHash;
        bytes32 policyHash;
        uint256 policyVersion;
        TreasuryTypes.ActionType actionType;
        address asset;
        address target;
        uint256 amount;
        uint256 value;
        uint256 chainId;
        uint256 timestamp;
        address executor;
        bytes32 metadataHash;
        bytes32 aiProposalHash;
        uint256 aiRiskScoreBps;
        bytes32 treatyId;
    }

    mapping(bytes32 => Receipt) public receipts;

    event ControllerUpdated(address indexed controller, bool locked);
    event ReceiptRecorded(bytes32 indexed receiptId, bytes32 indexed actionHash, bytes32 indexed policyHash, uint256 policyVersion);

    error NotController();
    error ControllerLocked();

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

    function setController(address controller_, bool lockController) external onlyGovernance {
        if (controllerLocked) revert ControllerLocked();
        require(controller_ != address(0), "controller=0");
        TreasuryInvariants.requireContract(controller_);
        controller = controller_;
        if (lockController) {
            controllerLocked = true;
        }
        emit ControllerUpdated(controller_, controllerLocked);
    }

    function recordReceipt(Receipt calldata receipt) external onlyController returns (bytes32 receiptId) {
        require(receipt.chainId != 0, "chainId=0");
        require(receipt.timestamp != 0, "timestamp=0");
        receiptId = receipt.receiptId;
        if (receiptId == bytes32(0)) {
            receiptId = keccak256(
                abi.encode(
                    receipt.actionHash,
                    receipt.policyHash,
                    receipt.policyVersion,
                    receipt.actionType,
                    receipt.asset,
                    receipt.target,
                    receipt.amount,
                    receipt.value,
                    receipt.chainId,
                    receipt.timestamp,
                    receipt.executor,
                    receipt.metadataHash,
                    receipt.aiProposalHash,
                    receipt.aiRiskScoreBps,
                    receipt.treatyId
                )
            );
        }
        receipts[receiptId] = Receipt({
            receiptId: receiptId,
            actionHash: receipt.actionHash,
            policyHash: receipt.policyHash,
            policyVersion: receipt.policyVersion,
            actionType: receipt.actionType,
            asset: receipt.asset,
            target: receipt.target,
            amount: receipt.amount,
            value: receipt.value,
            chainId: receipt.chainId,
            timestamp: receipt.timestamp,
            executor: receipt.executor,
            metadataHash: receipt.metadataHash,
            aiProposalHash: receipt.aiProposalHash,
            aiRiskScoreBps: receipt.aiRiskScoreBps,
            treatyId: receipt.treatyId
        });
        emit ReceiptRecorded(receiptId, receipt.actionHash, receipt.policyHash, receipt.policyVersion);
    }
}
