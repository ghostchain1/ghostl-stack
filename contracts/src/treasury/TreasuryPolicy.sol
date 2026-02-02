// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./TreasuryTypes.sol";
import "./TreasuryInvariants.sol";

/// @notice Encodes spend, reserve, and AI-gated treasury policies.
contract TreasuryPolicy is Governed {
    using TreasuryInvariants for uint256;

    address public controller;
    bool public controllerLocked;

    uint256 public minReserve;
    uint256 public epochBudget;
    uint256 public epochLength;
    uint256 public epochStart;
    uint256 public epochSpent;
    uint256 public maxRiskScoreBps;
    bool public receiptsRequired;
    uint256 public policyVersion;

    mapping(TreasuryTypes.ActionType => bool) public actionEnabled;
    mapping(TreasuryTypes.ActionType => bool) public actionRequiresAI;

    event ControllerUpdated(address indexed controller, bool locked);
    event PolicyConfigured(
        uint256 minReserve,
        uint256 epochBudget,
        uint256 epochLength,
        uint256 maxRiskScoreBps,
        bool receiptsRequired,
        uint256 policyVersion
    );
    event EpochRolled(uint256 indexed newStart);
    event ActionEnabled(TreasuryTypes.ActionType indexed actionType, bool enabled);
    event ActionAIRequired(TreasuryTypes.ActionType indexed actionType, bool required);

    error NotController();
    error ControllerLocked();
    error ActionDisabled();
    error RiskScoreTooHigh(uint256 riskScoreBps);
    error MissingAIProposal();
    error ReserveViolation(uint256 balance, uint256 minReserve);
    error BudgetViolation(uint256 spent, uint256 amount, uint256 budget);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
        policyVersion = 1;
        epochStart = block.timestamp;
        epochLength = 1 days;
        maxRiskScoreBps = 7_500;
        receiptsRequired = true;
        actionEnabled[TreasuryTypes.ActionType.TRANSFER] = true;
        actionEnabled[TreasuryTypes.ActionType.CALL] = true;
        actionEnabled[TreasuryTypes.ActionType.REBALANCE] = true;
        actionEnabled[TreasuryTypes.ActionType.FEDERATION] = true;
        actionEnabled[TreasuryTypes.ActionType.FEDERATION_EXIT] = true;
        actionRequiresAI[TreasuryTypes.ActionType.REBALANCE] = true;
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

    function configurePolicy(
        uint256 minReserve_,
        uint256 epochBudget_,
        uint256 epochLength_,
        uint256 maxRiskScoreBps_,
        bool receiptsRequired_
    ) external onlyGovernance {
        require(epochLength_ >= 1 hours, "epoch too short");
        require(maxRiskScoreBps_ <= 10_000, "risk>100%" );
        minReserve = minReserve_;
        epochBudget = epochBudget_;
        epochLength = epochLength_;
        maxRiskScoreBps = maxRiskScoreBps_;
        receiptsRequired = receiptsRequired_;
        policyVersion += 1;
        epochStart = block.timestamp;
        epochSpent = 0;
        emit PolicyConfigured(minReserve_, epochBudget_, epochLength_, maxRiskScoreBps_, receiptsRequired_, policyVersion);
    }

    function setActionEnabled(TreasuryTypes.ActionType actionType, bool enabled) external onlyGovernance {
        actionEnabled[actionType] = enabled;
        emit ActionEnabled(actionType, enabled);
    }

    function setActionAIRequired(TreasuryTypes.ActionType actionType, bool required) external onlyGovernance {
        actionRequiresAI[actionType] = required;
        emit ActionAIRequired(actionType, required);
    }

    function currentEpochSpent() public view returns (uint256 spent, uint256 start) {
        if (block.timestamp >= epochStart + epochLength) {
            return (0, block.timestamp - (block.timestamp % epochLength));
        }
        return (epochSpent, epochStart);
    }

    function policyHash() external view returns (bytes32) {
        return keccak256(
            abi.encode(
                policyVersion,
                minReserve,
                epochBudget,
                epochLength,
                maxRiskScoreBps,
                receiptsRequired
            )
        );
    }

    function validateAction(TreasuryTypes.Action calldata action, uint256 vaultBalance)
        external
        view
        returns (uint256 effectiveSpend, uint256 nextEpochSpent)
    {
        if (!actionEnabled[action.actionType]) revert ActionDisabled();

        if (actionRequiresAI[action.actionType]) {
            if (action.aiProposalHash == bytes32(0)) revert MissingAIProposal();
            if (action.aiRiskScoreBps > maxRiskScoreBps) revert RiskScoreTooHigh(action.aiRiskScoreBps);
        }

        effectiveSpend = action.amount + action.value;

        if (effectiveSpend > 0) {
            if (vaultBalance < minReserve + effectiveSpend) {
                revert ReserveViolation(vaultBalance, minReserve);
            }
            (uint256 spent, ) = currentEpochSpent();
            if (spent + effectiveSpend > epochBudget) {
                revert BudgetViolation(spent, effectiveSpend, epochBudget);
            }
            nextEpochSpent = spent + effectiveSpend;
        }
    }

    function consumeBudget(uint256 amount) external onlyController {
        (uint256 spent, uint256 start) = currentEpochSpent();
        if (start != epochStart) {
            epochStart = start;
            epochSpent = 0;
            spent = 0;
            emit EpochRolled(start);
        }
        if (amount > 0) {
            epochSpent = spent + amount;
        }
    }
}
