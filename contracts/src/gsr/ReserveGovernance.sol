// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveGovernance
/// @notice Governance for the Ghost Strategic Reserves Network.
///         Reserve issuance requires 4-of-7 multi-party approval.
///         Participants: treasury, central bank, independent auditor, validator council.
contract ReserveGovernance {

    uint8 public constant REQUIRED = 4;
    uint8 public constant MAX_APPROVERS = 7;

    struct ApprovalVote {
        uint256           approvalsCount;
        bool              executed;
        mapping(address => bool) voted;
    }

    mapping(address => bool) public approvers;
    uint256                  public approverCount;
    mapping(bytes32 => ApprovalVote) private votesFor;
    address public admin;

    event ApproverAdded(address indexed approver);
    event ApproverRemoved(address indexed approver);
    event ActionApproved(bytes32 indexed actionId, address approver, uint256 count);
    event ActionExecuted(bytes32 indexed actionId);

    modifier onlyAdmin()    { require(msg.sender == admin, "ResGov: not admin"); _; }
    modifier onlyApprover() { require(approvers[msg.sender], "ResGov: not approver"); _; }

    constructor() {
        admin = msg.sender;
        approvers[msg.sender] = true;
        approverCount = 1;
    }

    function addApprover(address a) external onlyAdmin {
        require(!approvers[a], "ResGov: already approver");
        require(approverCount < MAX_APPROVERS, "ResGov: max approvers reached");
        approvers[a] = true;
        approverCount++;
        emit ApproverAdded(a);
    }

    function removeApprover(address a) external onlyAdmin {
        require(approvers[a], "ResGov: not approver");
        approvers[a] = false;
        approverCount--;
        emit ApproverRemoved(a);
    }

    function approve(bytes32 actionId) external onlyApprover returns (bool executed) {
        ApprovalVote storage vote = votesFor[actionId];
        require(!vote.executed, "ResGov: already executed");
        require(!vote.voted[msg.sender], "ResGov: already voted");
        vote.voted[msg.sender] = true;
        vote.approvalsCount++;
        emit ActionApproved(actionId, msg.sender, vote.approvalsCount);
        if (vote.approvalsCount >= REQUIRED) {
            vote.executed = true;
            emit ActionExecuted(actionId);
            return true;
        }
        return false;
    }

    function isApproved(bytes32 actionId) external view returns (bool) {
        return votesFor[actionId].executed;
    }

    function approvalCount(bytes32 actionId) external view returns (uint256) {
        return votesFor[actionId].approvalsCount;
    }
}
