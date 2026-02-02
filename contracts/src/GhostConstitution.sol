// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IZKVerifier {
    function verify(bytes calldata proof) external view returns (bool);
}

contract GhostConstitution {
    bytes32 public constant CLAUSE_SAFETY = keccak256("GHOST_CONSTITUTION_SAFETY");
    bytes32 public constant CLAUSE_GOVERNANCE = keccak256("GHOST_CONSTITUTION_GOVERNANCE");
    bytes32 public constant CLAUSE_VALIDATOR = keccak256("GHOST_CONSTITUTION_VALIDATOR");

    address public governance;
    address public verifierAgent;
    address public zkVerifier;

    mapping(bytes32 => bool) public immutableClause;
    mapping(bytes32 => bool) public clauseAmended;
    mapping(bytes32 => bytes32) public clauseAmendmentHash;

    mapping(bytes32 => bool) public actionPermitted;
    mapping(bytes32 => bytes32) public actionClause;
    mapping(bytes32 => bytes32) public actionProofHash;

    event GovernanceChanged(address indexed previousGovernance, address indexed newGovernance);
    event VerifierAgentChanged(address indexed previousAgent, address indexed newAgent);
    event ZKVerifierChanged(address indexed previousVerifier, address indexed newVerifier);
    event ClauseAmended(bytes32 indexed clauseId, bytes32 indexed amendmentHash);
    event ActionRecorded(bytes32 indexed actionHash, bytes32 indexed clauseId, bytes32 indexed proofHash);
    event ActionPermissioned(bytes32 indexed actionHash, bool allowed);

    modifier onlyGovernance() {
        require(msg.sender == governance, "not governance");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == governance || msg.sender == verifierAgent, "not authorized");
        _;
    }

    constructor(address governance_, address verifierAgent_, address zkVerifier_) {
        governance = governance_ == address(0) ? msg.sender : governance_;
        verifierAgent = verifierAgent_;
        zkVerifier = zkVerifier_;

        immutableClause[CLAUSE_SAFETY] = true;
        immutableClause[CLAUSE_GOVERNANCE] = true;
        immutableClause[CLAUSE_VALIDATOR] = true;
    }

    function setGovernance(address newGovernance) external onlyGovernance {
        require(newGovernance != address(0), "zero address");
        emit GovernanceChanged(governance, newGovernance);
        governance = newGovernance;
    }

    function setVerifierAgent(address newAgent) external onlyGovernance {
        emit VerifierAgentChanged(verifierAgent, newAgent);
        verifierAgent = newAgent;
    }

    function setZKVerifier(address newVerifier) external onlyGovernance {
        emit ZKVerifierChanged(zkVerifier, newVerifier);
        zkVerifier = newVerifier;
    }

    function isActionPermitted(bytes32 actionHash) external view returns (bool) {
        return actionPermitted[actionHash];
    }

    function requireAmendment(bytes32 clauseId) external view {
        require(!immutableClause[clauseId], "clause immutable");
        require(clauseAmended[clauseId], "clause not amended");
    }

    function verifyZKCompliance(bytes calldata zkProof) public view returns (bool) {
        if (zkVerifier == address(0)) {
            return false;
        }
        return IZKVerifier(zkVerifier).verify(zkProof);
    }

    function amendClause(bytes32 clauseId, bytes32 amendmentHash) external onlyGovernance {
        require(!immutableClause[clauseId], "clause immutable");
        clauseAmended[clauseId] = true;
        clauseAmendmentHash[clauseId] = amendmentHash;
        emit ClauseAmended(clauseId, amendmentHash);
    }

    function permitAction(bytes32 actionHash, bool allowed) external onlyGovernance {
        actionPermitted[actionHash] = allowed;
        emit ActionPermissioned(actionHash, allowed);
    }

    function recordAction(bytes32 actionHash, bytes32 clauseId, bytes calldata zkProof)
        external
        onlyAuthorized
        returns (bool)
    {
        if (!immutableClause[clauseId]) {
            require(clauseAmended[clauseId], "amendment required");
        }
        require(verifyZKCompliance(zkProof), "zk compliance failed");

        bytes32 proofHash = keccak256(zkProof);
        actionPermitted[actionHash] = true;
        actionClause[actionHash] = clauseId;
        actionProofHash[actionHash] = proofHash;

        emit ActionRecorded(actionHash, clauseId, proofHash);
        return true;
    }
}
