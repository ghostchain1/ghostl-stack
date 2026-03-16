// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-locked registry for AI agents and their operators.
contract AgentRegistry is Governed {
    struct Agent {
        bytes32 role;
        address operator;
        bytes32 policyHash;
        string metadataURI;
        bool enabled;
        uint64 registeredAt;
        uint64 updatedAt;
        uint64 lastHeartbeat;
    }

    mapping(bytes32 => Agent) private agents;
    mapping(bytes32 => bool) private agentKnown;
    bytes32[] private agentIds;

    event AgentRegistered(bytes32 indexed agentId, bytes32 indexed role, address indexed operator, bytes32 policyHash);
    event AgentStatusUpdated(bytes32 indexed agentId, bool enabled);
    event AgentPolicyUpdated(bytes32 indexed agentId, bytes32 indexed policyHash);
    event AgentMetadataUpdated(bytes32 indexed agentId, string metadataURI);
    event AgentHeartbeat(bytes32 indexed agentId, address indexed operator, uint64 timestamp);

    error InvalidAgent();
    error InvalidOperator();
    error InvalidRole();
    error NotOperator();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function registerAgent(
        bytes32 agentId,
        address operator,
        bytes32 role,
        bytes32 policyHash,
        string calldata metadataURI
    ) external onlyGovernance {
        if (agentId == bytes32(0)) revert InvalidAgent();
        if (operator == address(0)) revert InvalidOperator();
        if (role == bytes32(0)) revert InvalidRole();

        if (!agentKnown[agentId]) {
            agentKnown[agentId] = true;
            agentIds.push(agentId);
        }

        Agent storage agent = agents[agentId];
        agent.role = role;
        agent.operator = operator;
        agent.policyHash = policyHash;
        agent.metadataURI = metadataURI;
        agent.enabled = true;
        uint64 nowTs = uint64(block.timestamp);
        if (agent.registeredAt == 0) {
            agent.registeredAt = nowTs;
        }
        agent.updatedAt = nowTs;
        emit AgentRegistered(agentId, role, operator, policyHash);
        emit AgentStatusUpdated(agentId, true);
        emit AgentMetadataUpdated(agentId, metadataURI);
    }

    function setAgentStatus(bytes32 agentId, bool enabled) external onlyGovernance {
        if (!agentKnown[agentId]) revert InvalidAgent();
        agents[agentId].enabled = enabled;
        agents[agentId].updatedAt = uint64(block.timestamp);
        emit AgentStatusUpdated(agentId, enabled);
    }

    function setAgentPolicy(bytes32 agentId, bytes32 policyHash) external onlyGovernance {
        if (!agentKnown[agentId]) revert InvalidAgent();
        agents[agentId].policyHash = policyHash;
        agents[agentId].updatedAt = uint64(block.timestamp);
        emit AgentPolicyUpdated(agentId, policyHash);
    }

    function setAgentMetadata(bytes32 agentId, string calldata metadataURI) external onlyGovernance {
        if (!agentKnown[agentId]) revert InvalidAgent();
        agents[agentId].metadataURI = metadataURI;
        agents[agentId].updatedAt = uint64(block.timestamp);
        emit AgentMetadataUpdated(agentId, metadataURI);
    }

    function heartbeat(bytes32 agentId) external {
        if (!agentKnown[agentId]) revert InvalidAgent();
        Agent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert NotOperator();
        agent.lastHeartbeat = uint64(block.timestamp);
        agent.updatedAt = uint64(block.timestamp);
        emit AgentHeartbeat(agentId, msg.sender, agent.lastHeartbeat);
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function isAgentActive(bytes32 agentId, uint64 maxAgeSeconds) external view returns (bool) {
        Agent memory agent = agents[agentId];
        // slither-disable-next-line incorrect-equality
        if (!agent.enabled || agent.registeredAt == 0) return false;
        // slither-disable-next-line incorrect-equality
        if (maxAgeSeconds == 0) return agent.enabled;
        // slither-disable-next-line incorrect-equality
        if (agent.lastHeartbeat == 0) return false;
        return block.timestamp <= agent.lastHeartbeat + maxAgeSeconds;
    }

    function agentCount() external view returns (uint256) {
        return agentIds.length;
    }

    function agentAt(uint256 index) external view returns (bytes32) {
        return agentIds[index];
    }
}
