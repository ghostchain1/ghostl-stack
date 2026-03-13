// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AIAudit — immutable audit trail for all AI agent decisions and actions
contract AIAudit {

    enum AuditCategory {
        DECISION,      // agent made an autonomous decision
        POLICY_PROP,   // agent proposed a policy change
        ORACLE_UPDATE, // agent updated an oracle feed
        ALERT_RAISED,  // agent raised a fraud/risk/anomaly alert
        GOVERNANCE,    // agent participated in governance
        SYSTEM_ACTION  // agent triggered a system action
    }

    struct AuditEntry {
        uint256       entryId;
        bytes32       agentId;
        AuditCategory category;
        string        action;
        bytes32       dataHash;    // hash of off-chain action payload
        uint256       timestamp;
        uint256       blockNum;
        bool          reviewed;
        address       reviewer;
    }

    uint256 public entryCount;
    mapping(uint256 => AuditEntry) public entries;
    mapping(bytes32  => uint256[]) public agentEntries;  // agentId → entry IDs

    address public governance;
    mapping(address => bool) public authorisedRecorders;

    event AuditRecorded(uint256 indexed entryId, bytes32 indexed agentId, AuditCategory category);
    event AuditReviewed(uint256 indexed entryId, address reviewer);

    modifier onlyGovernance() {
        require(msg.sender == governance, "AIAudit: not governance");
        _;
    }

    modifier onlyRecorder() {
        require(authorisedRecorders[msg.sender] || msg.sender == governance,
            "AIAudit: not authorised recorder");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
        authorisedRecorders[_gov] = true;
    }

    function authoriseRecorder(address recorder, bool status) external onlyGovernance {
        authorisedRecorders[recorder] = status;
    }

    function record(
        bytes32       agentId,
        AuditCategory category,
        string        calldata action,
        bytes32       dataHash
    ) external onlyRecorder returns (uint256 entryId) {
        entryId = entryCount++;
        entries[entryId] = AuditEntry({
            entryId:  entryId,
            agentId:  agentId,
            category: category,
            action:   action,
            dataHash: dataHash,
            timestamp:block.timestamp,
            blockNum: block.number,
            reviewed: false,
            reviewer: address(0)
        });
        agentEntries[agentId].push(entryId);
        emit AuditRecorded(entryId, agentId, category);
    }

    function markReviewed(uint256 entryId) external onlyGovernance {
        entries[entryId].reviewed = true;
        entries[entryId].reviewer = msg.sender;
        emit AuditReviewed(entryId, msg.sender);
    }

    function getAgentEntries(bytes32 agentId) external view returns (uint256[] memory) {
        return agentEntries[agentId];
    }
}
