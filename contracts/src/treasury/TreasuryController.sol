// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./TreasuryVault.sol";
import "./TreasuryPolicy.sol";
import "./TreasuryReceipts.sol";
import "./TreasuryTypes.sol";
import "./TreasuryInvariants.sol";
import "./PolicyViolationGuard.sol";
import "./TreasuryRouter.sol";
import "./federation/FederationRouter.sol";

/// @notice Executes only ratified actions and enforces treasury policy.
contract TreasuryController is Governed {
    using TreasuryInvariants for uint256;

    TreasuryVault public immutable vault;
    TreasuryPolicy public policy;
    PolicyViolationGuard public guard;
    TreasuryReceipts public receipts;
    TreasuryRouter public router;
    FederationRouter public federationRouter;

    event ComponentsUpdated(
        address indexed policy,
        address indexed guard,
        address indexed receipts,
        address router,
        address federationRouter
    );
    event TreasuryActionExecuted(bytes32 indexed actionHash, bytes32 indexed receiptId, TreasuryTypes.ActionType indexed actionType);

    error ComponentsUnset();
    error InvalidAction();
    error RouterUnset();
    error FederationRouterUnset();

    constructor(address governor_, address timelock_, TreasuryVault vault_) Governed(governor_, timelock_) {
        require(address(vault_) != address(0), "vault=0");
        vault = vault_;
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    function setComponents(
        TreasuryPolicy policy_,
        PolicyViolationGuard guard_,
        TreasuryReceipts receipts_,
        TreasuryRouter router_,
        FederationRouter federationRouter_
    ) external onlyGovernance {
        require(address(policy_) != address(0), "policy=0");
        require(address(guard_) != address(0), "guard=0");
        require(address(receipts_) != address(0), "receipts=0");
        TreasuryInvariants.requireContract(address(policy_));
        TreasuryInvariants.requireContract(address(guard_));
        TreasuryInvariants.requireContract(address(receipts_));
        policy = policy_;
        guard = guard_;
        receipts = receipts_;
        router = router_;
        federationRouter = federationRouter_;
        emit ComponentsUpdated(address(policy_), address(guard_), address(receipts_), address(router_), address(federationRouter_));
    }

    function setRouter(TreasuryRouter router_) external onlyGovernance {
        if (address(router_) != address(0)) {
            TreasuryInvariants.requireContract(address(router_));
        }
        router = router_;
        emit ComponentsUpdated(address(policy), address(guard), address(receipts), address(router_), address(federationRouter));
    }

    function setFederationRouter(FederationRouter federationRouter_) external onlyGovernance {
        if (address(federationRouter_) != address(0)) {
            TreasuryInvariants.requireContract(address(federationRouter_));
        }
        federationRouter = federationRouter_;
        emit ComponentsUpdated(address(policy), address(guard), address(receipts), address(router), address(federationRouter_));
    }

    function execute(TreasuryTypes.Action calldata action) external onlyGovernance returns (bytes32 receiptId) {
        if (address(policy) == address(0) || address(guard) == address(0) || address(receipts) == address(0)) {
            revert ComponentsUnset();
        }

        uint256 vaultBalance = vault.balanceOf(action.asset);
        (bytes32 policyHash, uint256 policyVersion, uint256 spendAmount) = guard.enforce(action, vaultBalance);

        bytes32 actionHash = keccak256(
            abi.encode(
                action.actionType,
                action.asset,
                action.target,
                action.amount,
                action.value,
                action.destinationChainId,
                keccak256(action.data),
                action.metadataHash,
                action.aiProposalHash,
                action.aiRiskScoreBps,
                action.treatyId
            )
        );

        if (action.destinationChainId != 0 && action.destinationChainId != block.chainid) {
            TreasuryRouter routerRef = router;
            if (address(routerRef) == address(0)) revert RouterUnset();
            routerRef.route(action);
        } else {
            _executeLocal(action);
        }

        policy.consumeBudget(spendAmount);

        receiptId = receipts.recordReceipt(
            TreasuryReceipts.Receipt({
                receiptId: bytes32(0),
                actionHash: actionHash,
                policyHash: policyHash,
                policyVersion: policyVersion,
                actionType: action.actionType,
                asset: action.asset,
                target: action.target,
                amount: action.amount,
                value: action.value,
                chainId: block.chainid,
                timestamp: block.timestamp,
                executor: msg.sender,
                metadataHash: action.metadataHash,
                aiProposalHash: action.aiProposalHash,
                aiRiskScoreBps: action.aiRiskScoreBps,
                treatyId: action.treatyId
            })
        );

        TreasuryInvariants.assertReserveInvariant(vault.balanceOf(action.asset), policy.minReserve());
        emit TreasuryActionExecuted(actionHash, receiptId, action.actionType);
    }

    function _executeLocal(TreasuryTypes.Action calldata action) internal {
        if (action.actionType == TreasuryTypes.ActionType.TRANSFER) {
            _enforceNoCircular(action.target);
            if (action.asset == address(0)) {
                vault.transferETH(action.target, action.amount);
            } else {
                vault.transferGST20(action.asset, action.target, action.amount);
            }
            return;
        }

        if (action.actionType == TreasuryTypes.ActionType.CALL || action.actionType == TreasuryTypes.ActionType.REBALANCE) {
            _enforceNoCircular(action.target);
            vault.executeCall(action.target, action.value, action.data);
            return;
        }

        if (action.actionType == TreasuryTypes.ActionType.FEDERATION) {
            FederationRouter routerRef = federationRouter;
            if (address(routerRef) == address(0)) revert FederationRouterUnset();
            _enforceNoCircular(action.target);
            if (action.asset == address(0)) {
                vault.transferETH(action.target, action.amount);
            } else {
                vault.transferGST20(action.asset, action.target, action.amount);
            }
            routerRef.recordDraw(action.treatyId, action.asset, action.target, action.amount);
            return;
        }

        if (action.actionType == TreasuryTypes.ActionType.FEDERATION_EXIT) {
            FederationRouter routerRef = federationRouter;
            if (address(routerRef) == address(0)) revert FederationRouterUnset();
            if (action.data.length == 0) revert InvalidAction();
            uint8 mode = uint8(action.data[0]);
            if (mode == 0) {
                routerRef.requestExit(action.treatyId);
            } else if (mode == 1) {
                routerRef.finalizeExit(action.treatyId);
            } else {
                revert InvalidAction();
            }
            return;
        }

        revert InvalidAction();
    }

    function _enforceNoCircular(address target) internal view {
        require(target != address(vault), "target vault");
        require(target != address(this), "target controller");
        require(target != governor, "target governor");
        if (timelock != address(0)) {
            require(target != timelock, "target timelock");
        }
    }
}
