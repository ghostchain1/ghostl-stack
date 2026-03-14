// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AIAgentRegistry — on-chain registry of sanctioned AI agents operating in GhostStack
contract AIAgentRegistry {

    enum AgentType {
        MARKET_MONITOR,
        RISK_ASSESSOR,
        POLICY_ENGINE,
        FRAUD_DETECTOR,
        ORACLE_FEEDER,
        GOVERNANCE_AI,
        ECONOMIC_FORECASTER,
        SYSTEM_GUARDIAN
    }

    enum AgentStatus { PENDING, ACTIVE, SUSPENDED, DECOMMISSIONED }

    struct AIAgent {
        bytes32     agentId;      // keccak256(name)
        string      name;         // e.g. "ai.market-monitor"
        AgentType   agentType;
        address     operatorWallet;
        bytes32     modelHash;    // keccak256 of model weights / version tag
        AgentStatus status;
        uint256     registeredAt;
        uint256     activatedAt;
        uint256     decisionCount;
        int256      performanceScore; // ± basis-point accuracy rating
    }

    uint256 public agentCount;
    mapping(bytes32  => AIAgent) public agents;         // agentId => Agent
    mapping(address  => bytes32) public operatorAgent;  // one agent per operator
    bytes32[] public agentIndex;

    address public governance;
    mapping(address => bool) public activators;

    event AgentRegistered(bytes32 indexed agentId, string name, AgentType agentType);
    event AgentActivated(bytes32 indexed agentId);
    event AgentSuspended(bytes32 indexed agentId, string reason);
    event AgentDecommissioned(bytes32 indexed agentId);
    event AgentModelUpdated(bytes32 indexed agentId, bytes32 newModelHash);
    event DecisionRecorded(bytes32 indexed agentId, uint256 totalDecisions);

    modifier onlyGovernance() {
        require(msg.sender == governance, "AIAgentRegistry: not governance");
        _;
    }

    modifier onlyActivator() {
        require(activators[msg.sender] || msg.sender == governance,
            "AIAgentRegistry: not activator");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
        activators[_gov] = true;
    }

    function setActivator(address activator, bool status) external onlyGovernance {
        activators[activator] = status;
    }

    function registerAgent(
        string    calldata name,
        AgentType agentType,
        bytes32   modelHash
    ) external returns (bytes32 agentId) {
        agentId = keccak256(abi.encodePacked(name));
        require(agents[agentId].registeredAt == 0, "AIAgentRegistry: already registered");
        require(operatorAgent[msg.sender] == bytes32(0), "AIAgentRegistry: operator has agent");

        agents[agentId] = AIAgent({
            agentId:          agentId,
            name:             name,
            agentType:        agentType,
            operatorWallet:   msg.sender,
            modelHash:        modelHash,
            status:           AgentStatus.PENDING,
            registeredAt:     block.timestamp,
            activatedAt:      0,
            decisionCount:    0,
            performanceScore: 0
        });
        operatorAgent[msg.sender] = agentId;
        agentIndex.push(agentId);
        agentCount++;

        emit AgentRegistered(agentId, name, agentType);
    }

    function activateAgent(bytes32 agentId) external onlyActivator {
        AIAgent storage a = agents[agentId];
        require(a.status == AgentStatus.PENDING, "AIAgentRegistry: not pending");
        a.status      = AgentStatus.ACTIVE;
        a.activatedAt = block.timestamp;
        emit AgentActivated(agentId);
    }

    function suspendAgent(bytes32 agentId, string calldata reason) external onlyGovernance {
        agents[agentId].status = AgentStatus.SUSPENDED;
        emit AgentSuspended(agentId, reason);
    }

    function decommissionAgent(bytes32 agentId) external onlyGovernance {
        agents[agentId].status = AgentStatus.DECOMMISSIONED;
        emit AgentDecommissioned(agentId);
    }

    function updateModelHash(bytes32 agentId, bytes32 newModelHash) external {
        AIAgent storage a = agents[agentId];
        require(a.operatorWallet == msg.sender || msg.sender == governance,
            "AIAgentRegistry: not operator");
        a.modelHash = newModelHash;
        emit AgentModelUpdated(agentId, newModelHash);
    }

    function recordDecision(bytes32 agentId) external {
        AIAgent storage a = agents[agentId];
        require(a.operatorWallet == msg.sender, "AIAgentRegistry: not operator");
        require(a.status == AgentStatus.ACTIVE, "AIAgentRegistry: not active");
        a.decisionCount++;
        emit DecisionRecorded(agentId, a.decisionCount);
    }

    function updatePerformanceScore(bytes32 agentId, int256 score) external onlyGovernance {
        agents[agentId].performanceScore = score;
    }

    function isActiveAgent(bytes32 agentId) external view returns (bool) {
        return agents[agentId].status == AgentStatus.ACTIVE;
    }

    function getAgentIndex() external view returns (bytes32[] memory) {
        return agentIndex;
    }
}
