// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AutonomousPolicy — AI-proposed parameter adjustments that execute with governance approval
contract AutonomousPolicy {

    struct PolicyChange {
        bytes32  agentId;        // AI agent proposing the change
        string   subsystem;      // e.g. "GSX", "GCM", "GSE"
        string   parameter;      // e.g. "reserveRatio", "interestRate"
        int256   currentValue;
        int256   proposedValue;
        string   rationale;      // AI-generated explanation
        uint256  confidence;     // 0-10000 bps
        uint256  proposedAt;
        bool     approved;
        bool     rejected;
        uint256  executedAt;
    }

    uint256 public nextChangeId;
    mapping(uint256 => PolicyChange) public changes;

    address public governance;
    address public agentRegistry;

    event PolicyProposed(uint256 indexed id, bytes32 agentId, string subsystem, string parameter);
    event PolicyApproved(uint256 indexed id, address approver);
    event PolicyRejected(uint256 indexed id, string reason);
    event PolicyExecuted(uint256 indexed id, int256 value);

    modifier onlyGovernance() {
        require(msg.sender == governance, "AutonomousPolicy: not governance");
        _;
    }

    constructor(address _gov, address _agentRegistry) {
        governance     = _gov;
        agentRegistry  = _agentRegistry;
    }

    function proposeChange(
        bytes32 agentId,
        string  calldata subsystem,
        string  calldata parameter,
        int256  currentValue,
        int256  proposedValue,
        string  calldata rationale,
        uint256 confidence
    ) external returns (uint256 id) {
        require(confidence <= 10000, "AutonomousPolicy: confidence > 100%");
        id = nextChangeId++;
        changes[id] = PolicyChange({
            agentId:       agentId,
            subsystem:     subsystem,
            parameter:     parameter,
            currentValue:  currentValue,
            proposedValue: proposedValue,
            rationale:     rationale,
            confidence:    confidence,
            proposedAt:    block.timestamp,
            approved:      false,
            rejected:      false,
            executedAt:    0
        });
        emit PolicyProposed(id, agentId, subsystem, parameter);
    }

    function approveChange(uint256 changeId) external onlyGovernance {
        PolicyChange storage c = changes[changeId];
        require(!c.approved && !c.rejected, "AutonomousPolicy: already decided");
        c.approved    = true;
        c.executedAt  = block.timestamp;
        emit PolicyApproved(changeId, msg.sender);
        emit PolicyExecuted(changeId, c.proposedValue);
    }

    function rejectChange(uint256 changeId, string calldata reason) external onlyGovernance {
        PolicyChange storage c = changes[changeId];
        require(!c.approved && !c.rejected, "AutonomousPolicy: already decided");
        c.rejected = true;
        emit PolicyRejected(changeId, reason);
    }
}
