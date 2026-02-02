// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AIGovernanceEscalation} from "./AIGovernanceEscalation.sol";
import {EvidenceBundle} from "./EvidenceBundle.sol";
import {ConstitutionalGuard} from "../common/ConstitutionalGuard.sol";
import {Ownable} from "../common/Ownable.sol";

interface IAgentGovernancePolicy {
    function isActionAllowed(bytes32 role, bytes32 action) external view returns (bool);
    function recordAction(bytes32 role, bytes32 action) external;
}

/// @notice Executes AI-attested decisions with feed-verified inputs and guarded actions.
contract AICommandCenter is Ownable {
    uint8 public constant L1 = 1;
    uint8 public constant L2 = 2;
    uint8 public constant L3 = 3;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant DECISION_TYPEHASH =
        keccak256(
            "Decision(uint256 nonce,uint8 action,address target,bytes4 selector,bytes32 dataHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest,bytes32 modelId,uint64 gasLimit)"
        );
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct LayerFeed {
        bytes32 digest;
        uint64 blockNumber;
        uint64 updatedAt;
    }

    struct OffchainFeed {
        bytes32 digest;
        uint64 updatedAt;
    }

    struct ActionPolicy {
        bool enabled;
        bool hasValueBounds;
        uint64 cooldownSeconds;
        uint128 minValue;
        uint128 maxValue;
    }

    struct Decision {
        uint256 nonce;
        uint8 action;
        address target;
        bytes4 selector;
        bytes data;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
        bytes32 modelId;
        uint64 gasLimit;
    }

    struct DecisionHashData {
        uint256 nonce;
        uint8 action;
        address target;
        bytes4 selector;
        bytes32 dataHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
        bytes32 modelId;
        uint64 gasLimit;
    }

    mapping(uint8 => LayerFeed) public layerFeeds;
    mapping(uint8 => mapping(address => bool)) public layerOracles;
    mapping(address => bool) public aiSigners;
    mapping(bytes32 => bool) public allowedModels;
    mapping(bytes32 => uint32) public modelMinConfidenceBps;
    mapping(bytes32 => bytes32) public modelInputSchemaHash;
    mapping(bytes32 => bytes32) public modelOutputSchemaHash;
    mapping(address => mapping(bytes4 => ActionPolicy)) public actionPolicies;
    mapping(bytes32 => uint64) public lastActionAt;
    mapping(bytes32 => bool) public usedDecisions;
    mapping(uint8 => bool) public requireLayerDigest;
    mapping(uint8 => uint64) public maxLayerAge;
    mapping(address => bool) public offchainOracles;

    OffchainFeed public offchainFeed;

    uint32 public minConfidenceBps = 8000;
    uint64 public maxDecisionAge = 15 minutes;
    uint64 public maxOffchainAge = 10 minutes;
    uint256 public minSigners = 1;
    bool public requireOffchainDigest = true;
    bool public paused;

    uint256 private immutable cachedChainId;
    bytes32 private immutable cachedDomainSeparator;
    uint256 private executionGuard;

    address public governor;
    address public timelock;
    EvidenceBundle public evidenceBundle;
    ConstitutionalGuard public constitutionalGuard;
    AIGovernanceEscalation public escalationModule;
    mapping(address => mapping(bytes4 => uint16)) public actionRiskBps;
    address public policyRegistry;
    bytes32 public policyRole;
    bool public enforcePolicyRegistry;
    bool public recordPolicyRegistry;

    bytes32 internal constant ACTION_AI_COMMAND = keccak256("ghost.ai.command.execute");
    bytes32 internal constant DEFAULT_POLICY_ROLE = keccak256("ghost.ai.commander");

    event LayerOracleUpdated(uint8 indexed layer, address indexed oracle, bool allowed);
    event LayerDigestUpdated(uint8 indexed layer, bytes32 digest, uint64 blockNumber, uint64 updatedAt, address oracle);
    event OffchainOracleUpdated(address indexed oracle, bool allowed);
    event OffchainDigestUpdated(bytes32 digest, uint64 updatedAt, address oracle);
    event SignerUpdated(address indexed signer, bool allowed);
    event ModelUpdated(bytes32 indexed modelId, bool allowed);
    event ModelPolicyUpdated(
        bytes32 indexed modelId,
        bool allowed,
        uint32 minConfidenceBps,
        bytes32 inputSchemaHash,
        bytes32 outputSchemaHash
    );
    event PolicyUpdated(uint32 minConfidenceBps, uint64 maxDecisionAge, bool requireOffchainDigest, uint256 minSigners);
    event LayerRequirementUpdated(uint8 indexed layer, bool required);
    event LayerMaxAgeUpdated(uint8 indexed layer, uint64 maxAge);
    event OffchainMaxAgeUpdated(uint64 maxAge);
    event ActionPolicyUpdated(address indexed target, bytes4 indexed selector, ActionPolicy policy);
    event DecisionExecuted(bytes32 indexed decisionHash, address indexed target, bytes4 indexed selector, uint64 gasLimit);
    event PausedSet(bool paused);
    event GovernanceConfigUpdated(address indexed governor, address indexed timelock);
    event EvidenceBundleUpdated(address indexed bundle);
    event ConstitutionalGuardUpdated(address indexed guard);
    event EscalationModuleUpdated(address indexed module);
    event ActionRiskUpdated(address indexed target, bytes4 indexed selector, uint16 riskScoreBps);
    event PolicyRegistryUpdated(address indexed registry, bytes32 indexed role, bool enforce, bool record);

    modifier onlyGovernance() {
        require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        _;
    }

    modifier onlyGovernanceOrBootstrap() {
        if (governor == address(0)) {
            require(msg.sender == owner, "bootstrap only");
        } else {
            require(msg.sender == governor || (timelock != address(0) && msg.sender == timelock), "NOT_EXECUTOR");
        }
        _;
    }

    modifier onlyOracle(uint8 layer) {
        require(layerOracles[layer][msg.sender], "not oracle");
        _;
    }

    modifier onlyOffchainOracle() {
        require(offchainOracles[msg.sender], "not offchain oracle");
        _;
    }

    modifier nonReentrant() {
        require(executionGuard == 0, "reentrancy");
        executionGuard = 1;
        _;
        executionGuard = 0;
    }

    constructor() {
        cachedChainId = block.chainid;
        cachedDomainSeparator = _buildDomainSeparator();
        requireLayerDigest[L1] = true;
        requireLayerDigest[L2] = true;
        requireLayerDigest[L3] = true;
        maxLayerAge[L1] = 10 minutes;
        maxLayerAge[L2] = 10 minutes;
        maxLayerAge[L3] = 10 minutes;
        policyRole = DEFAULT_POLICY_ROLE;
    }

    function setGovernance(address governor_, address timelock_) external onlyOwner {
        require(governor_ != address(0), "governor=0");
        governor = governor_;
        timelock = timelock_;
        emit GovernanceConfigUpdated(governor_, timelock_);
    }

    function setEvidenceBundle(EvidenceBundle bundle) external onlyGovernanceOrBootstrap {
        evidenceBundle = bundle;
        emit EvidenceBundleUpdated(address(bundle));
    }

    function setConstitutionalGuard(ConstitutionalGuard guard) external onlyGovernanceOrBootstrap {
        constitutionalGuard = guard;
        emit ConstitutionalGuardUpdated(address(guard));
    }

    function setEscalationModule(AIGovernanceEscalation module) external onlyGovernanceOrBootstrap {
        escalationModule = module;
        emit EscalationModuleUpdated(address(module));
    }

    function setPolicyRegistry(address registry, bytes32 role, bool enforce, bool record) external onlyGovernanceOrBootstrap {
        if (registry == address(0)) {
            require(!enforce && !record, "policy registry required");
        }
        if (registry != address(0)) {
            require(role != bytes32(0), "role=0");
        }
        policyRegistry = registry;
        policyRole = role == bytes32(0) ? policyRole : role;
        enforcePolicyRegistry = enforce;
        recordPolicyRegistry = record;
        emit PolicyRegistryUpdated(registry, policyRole, enforce, record);
    }

    function setActionRiskBps(address target, bytes4 selector, uint16 riskScoreBps) external onlyGovernance {
        require(riskScoreBps <= 10_000, "risk>10000");
        actionRiskBps[target][selector] = riskScoreBps;
        emit ActionRiskUpdated(target, selector, riskScoreBps);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        aiSigners[signer] = allowed;
        emit SignerUpdated(signer, allowed);
    }

    function setModel(bytes32 modelId, bool allowed) external onlyOwner {
        allowedModels[modelId] = allowed;
        emit ModelUpdated(modelId, allowed);
    }

    function setModelPolicy(
        bytes32 modelId,
        bool allowed,
        uint32 minConfidenceBps_,
        bytes32 inputSchemaHash,
        bytes32 outputSchemaHash
    ) external onlyOwner {
        allowedModels[modelId] = allowed;
        modelMinConfidenceBps[modelId] = minConfidenceBps_;
        modelInputSchemaHash[modelId] = inputSchemaHash;
        modelOutputSchemaHash[modelId] = outputSchemaHash;
        emit ModelPolicyUpdated(modelId, allowed, minConfidenceBps_, inputSchemaHash, outputSchemaHash);
    }

    function setLayerOracle(uint8 layer, address oracle, bool allowed) external onlyOwner {
        _requireLayer(layer);
        layerOracles[layer][oracle] = allowed;
        emit LayerOracleUpdated(layer, oracle, allowed);
    }

    function submitLayerDigest(
        uint8 layer,
        bytes32 digest,
        uint64 blockNumber,
        uint64 updatedAt
    ) external onlyOracle(layer) {
        _requireLayer(layer);
        LayerFeed storage feed = layerFeeds[layer];
        require(blockNumber >= feed.blockNumber, "stale block");
        require(updatedAt >= feed.updatedAt, "stale time");
        feed.digest = digest;
        feed.blockNumber = blockNumber;
        feed.updatedAt = updatedAt;
        emit LayerDigestUpdated(layer, digest, blockNumber, updatedAt, msg.sender);
    }

    function setOffchainOracle(address oracle, bool allowed) external onlyOwner {
        offchainOracles[oracle] = allowed;
        emit OffchainOracleUpdated(oracle, allowed);
    }

    function submitOffchainDigest(bytes32 digest, uint64 updatedAt) external onlyOffchainOracle {
        require(updatedAt >= offchainFeed.updatedAt, "stale time");
        offchainFeed = OffchainFeed({digest: digest, updatedAt: updatedAt});
        emit OffchainDigestUpdated(digest, updatedAt, msg.sender);
    }

    function setLayerRequired(uint8 layer, bool required) external onlyOwner {
        _requireLayer(layer);
        requireLayerDigest[layer] = required;
        emit LayerRequirementUpdated(layer, required);
    }

    function setLayerMaxAge(uint8 layer, uint64 maxAge) external onlyOwner {
        _requireLayer(layer);
        maxLayerAge[layer] = maxAge;
        emit LayerMaxAgeUpdated(layer, maxAge);
    }

    function setOffchainMaxAge(uint64 maxAge) external onlyOwner {
        maxOffchainAge = maxAge;
        emit OffchainMaxAgeUpdated(maxAge);
    }

    function setPolicy(
        uint32 minConfidenceBps_,
        uint64 maxDecisionAge_,
        bool requireOffchainDigest_,
        uint256 minSigners_
    ) external onlyOwner {
        require(minSigners_ > 0, "minSigners=0");
        minConfidenceBps = minConfidenceBps_;
        maxDecisionAge = maxDecisionAge_;
        requireOffchainDigest = requireOffchainDigest_;
        minSigners = minSigners_;
        emit PolicyUpdated(minConfidenceBps_, maxDecisionAge_, requireOffchainDigest_, minSigners_);
    }

    function setActionPolicy(
        address target,
        bytes4 selector,
        bool enabled,
        uint64 cooldownSeconds,
        bool hasValueBounds,
        uint128 minValue,
        uint128 maxValue
    ) external onlyOwner {
        ActionPolicy storage policy = actionPolicies[target][selector];
        policy.enabled = enabled;
        policy.cooldownSeconds = cooldownSeconds;
        policy.hasValueBounds = hasValueBounds;
        policy.minValue = minValue;
        policy.maxValue = maxValue;
        emit ActionPolicyUpdated(target, selector, policy);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function executeDecision(
        Decision calldata decision,
        bytes[] calldata signatures
    ) external nonReentrant returns (bytes32) {
        _precheckDecision(decision);
        bytes32 decisionHash = _hashDecision(decision);
        _consumeDecision(decisionHash, signatures);
        _enforcePolicyRegistry(decision.target, decision.selector);
        bytes32 actionHash = keccak256(
            abi.encode(
                ACTION_AI_COMMAND,
                decisionHash,
                decision.target,
                decision.selector,
                keccak256(decision.data),
                decision.gasLimit
            )
        );
        ConstitutionalGuard guard = constitutionalGuard;
        require(address(guard) != address(0), "constitution guard=0");
        guard.checkAICommand(actionHash, msg.sender, decision.data);

        EvidenceBundle bundle = evidenceBundle;
        require(address(bundle) != address(0), "evidence bundle=0");
        EvidenceBundle.Bundle memory evidence = EvidenceBundle.Bundle({
            policyHash: actionHash,
            decisionHash: decisionHash,
            modelHash: decision.modelId,
            executionHash: keccak256(
                abi.encode(decision.target, decision.selector, keccak256(decision.data), decision.gasLimit)
            ),
            timestamp: block.timestamp,
            chainId: block.chainid,
            emitter: address(this)
        });
        (bytes32 bundleId, ) = bundle.recordBundle(evidence, bytes(""));

        AIGovernanceEscalation escalation = escalationModule;
        if (address(escalation) != address(0)) {
            uint16 riskScoreBps = actionRiskBps[decision.target][decision.selector];
            escalation.submitIntent(
                bundleId,
                riskScoreBps,
                uint16(decision.confidenceBps),
                decision.target,
                0,
                abi.encodePacked(decision.selector, decision.data)
            );
        }

        _executeAction(decision, decisionHash);
        return decisionHash;
    }

    function _precheckDecision(Decision calldata decision) internal view {
        require(!paused, "paused");
        require(decision.target != address(0), "target=0");
        require(decision.selector != bytes4(0), "selector=0");
        require(decision.validUntil >= block.timestamp, "expired");
        require(decision.issuedAt <= block.timestamp, "future");
        require(block.timestamp - decision.issuedAt <= maxDecisionAge, "stale");
        require(allowedModels[decision.modelId], "model not allowed");
        require(decision.confidenceBps >= _requiredConfidence(decision.modelId), "low confidence");
        if (requireOffchainDigest) {
            _checkOffchainDigest(decision.offchainDigest);
        }
        _checkLayerDigest(L1, decision.l1Digest);
        _checkLayerDigest(L2, decision.l2Digest);
        _checkLayerDigest(L3, decision.l3Digest);
    }

    function _consumeDecision(bytes32 decisionHash, bytes[] calldata signatures) internal {
        require(!usedDecisions[decisionHash], "decision used");
        _validateSignatures(decisionHash, signatures);
        usedDecisions[decisionHash] = true;
    }

    function _executeAction(Decision calldata decision, bytes32 decisionHash) internal {
        ActionPolicy memory policy = actionPolicies[decision.target][decision.selector];
        require(policy.enabled, "action disabled");
        _enforceCooldown(decision.target, decision.selector, policy.cooldownSeconds);
        _enforceBounds(decision, policy);

        bytes memory payload = abi.encodePacked(decision.selector, decision.data);
        uint64 gasLimit = decision.gasLimit == 0 ? uint64(gasleft()) : decision.gasLimit;
        (bool ok, ) = decision.target.call{gas: gasLimit}(payload);
        require(ok, "call failed");
        emit DecisionExecuted(decisionHash, decision.target, decision.selector, gasLimit);
    }

    function _enforcePolicyRegistry(address target, bytes4 selector) internal {
        address registry = policyRegistry;
        if (registry == address(0)) return;
        bytes32 actionId = keccak256(abi.encodePacked(target, selector));
        if (enforcePolicyRegistry) {
            require(IAgentGovernancePolicy(registry).isActionAllowed(policyRole, actionId), "policy");
        }
        if (recordPolicyRegistry) {
            IAgentGovernancePolicy(registry).recordAction(policyRole, actionId);
        }
    }

    function _requiredConfidence(bytes32 modelId) internal view returns (uint32) {
        uint32 modelMin = modelMinConfidenceBps[modelId];
        return modelMin == 0 ? minConfidenceBps : modelMin;
    }

    function _checkLayerDigest(uint8 layer, bytes32 decisionDigest) internal view {
        _requireLayer(layer);
        if (!requireLayerDigest[layer]) return;
        LayerFeed storage feed = layerFeeds[layer];
        bytes32 feedDigest = feed.digest;
        require(feedDigest != bytes32(0), "missing digest");
        uint64 maxAge = maxLayerAge[layer];
        if (maxAge != 0) {
            require(block.timestamp <= feed.updatedAt + maxAge, "digest stale");
        }
        require(decisionDigest == feedDigest, "digest mismatch");
    }

    function _checkOffchainDigest(bytes32 decisionDigest) internal view {
        require(decisionDigest != bytes32(0), "offchain digest required");
        bytes32 feedDigest = offchainFeed.digest;
        require(feedDigest != bytes32(0), "missing offchain digest");
        if (maxOffchainAge != 0) {
            require(block.timestamp <= offchainFeed.updatedAt + maxOffchainAge, "offchain stale");
        }
        require(decisionDigest == feedDigest, "offchain digest mismatch");
    }

    function _enforceCooldown(address target, bytes4 selector, uint64 cooldownSeconds) internal {
        if (cooldownSeconds == 0) return;
        bytes32 key = keccak256(abi.encodePacked(target, selector));
        uint64 lastAt = lastActionAt[key];
        require(block.timestamp >= lastAt + cooldownSeconds, "cooldown");
        lastActionAt[key] = uint64(block.timestamp);
    }

    function _enforceBounds(Decision calldata decision, ActionPolicy memory policy) internal pure {
        if (!policy.hasValueBounds) return;
        require(decision.data.length == 32, "bounds length");
        uint256 value = abi.decode(decision.data, (uint256));
        require(value >= policy.minValue, "below min");
        require(value <= policy.maxValue, "above max");
    }

    function _validateSignatures(bytes32 decisionHash, bytes[] calldata signatures) internal view {
        require(signatures.length >= minSigners, "signatures");
        address[] memory seen = new address[](signatures.length);
        uint256 valid = 0;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recoverSigner(decisionHash, signatures[i]);
            if (!aiSigners[signer]) {
                continue;
            }
            bool dup = false;
            for (uint256 j = 0; j < valid; j++) {
                if (seen[j] == signer) {
                    dup = true;
                    break;
                }
            }
            if (dup) {
                continue;
            }
            seen[valid] = signer;
            valid++;
            if (valid >= minSigners) {
                return;
            }
        }
        revert("quorum");
    }

    function _recoverSigner(bytes32 decisionHash, bytes calldata signature) internal view returns (address) {
        require(signature.length == 65, "sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "sig v");
        require(uint256(s) <= SECP256K1N_HALF, "sig s");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), decisionHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "sig");
        return signer;
    }

    function _hashDecision(Decision calldata decision) internal pure returns (bytes32) {
        DecisionHashData memory data = DecisionHashData({
            nonce: decision.nonce,
            action: decision.action,
            target: decision.target,
            selector: decision.selector,
            dataHash: keccak256(decision.data),
            issuedAt: decision.issuedAt,
            validUntil: decision.validUntil,
            confidenceBps: decision.confidenceBps,
            l1Digest: decision.l1Digest,
            l2Digest: decision.l2Digest,
            l3Digest: decision.l3Digest,
            offchainDigest: decision.offchainDigest,
            modelId: decision.modelId,
            gasLimit: decision.gasLimit
        });
        return keccak256(abi.encode(DECISION_TYPEHASH, data));
    }

    function _domainSeparator() internal view returns (bytes32) {
        if (block.chainid == cachedChainId) {
            return cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes("GhostAICommandCenter")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    function _requireLayer(uint8 layer) internal pure {
        require(layer == L1 || layer == L2 || layer == L3, "layer");
    }
}
