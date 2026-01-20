// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../common/Ownable.sol";

/// @notice Base contract for AI attestations backed by signer quorum and feed digests.
abstract contract AIAttestationBase is Ownable {
    uint8 public constant L1 = 1;
    uint8 public constant L2 = 2;
    uint8 public constant L3 = 3;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256(bytes("GhostAIGuardian"));
    bytes32 private constant VERSION_HASH = keccak256(bytes("1"));
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

    mapping(uint8 => LayerFeed) public layerFeeds;
    mapping(uint8 => mapping(address => bool)) public layerOracles;
    mapping(address => bool) public offchainOracles;
    OffchainFeed public offchainFeed;

    mapping(address => bool) public aiSigners;
    mapping(bytes32 => bool) public allowedModels;
    mapping(bytes32 => uint32) public modelMinConfidenceBps;
    mapping(bytes32 => bytes32) public modelInputSchemaHash;
    mapping(bytes32 => bytes32) public modelOutputSchemaHash;
    mapping(bytes32 => bool) public usedAttestations;

    mapping(uint8 => bool) public requireLayerDigest;
    mapping(uint8 => uint64) public maxLayerAge;

    struct AttestationInput {
        uint64 issuedAt;
        uint64 validUntil;
        uint32 confidenceBps;
        bytes32 modelId;
        bytes32 l1Digest;
        bytes32 l2Digest;
        bytes32 l3Digest;
        bytes32 offchainDigest;
    }

    uint32 public minConfidenceBps = 8000;
    uint64 public maxAttestationAge = 15 minutes;
    uint64 public maxOffchainAge = 10 minutes;
    uint256 public minSigners = 1;
    bool public requireOffchainDigest = true;
    bool public paused;

    uint256 private immutable cachedChainId;
    bytes32 private immutable cachedDomainSeparator;

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
    event PolicyUpdated(
        uint32 minConfidenceBps,
        uint64 maxAttestationAge,
        bool requireOffchainDigest,
        uint256 minSigners
    );
    event LayerRequirementUpdated(uint8 indexed layer, bool required);
    event LayerMaxAgeUpdated(uint8 indexed layer, uint64 maxAge);
    event OffchainMaxAgeUpdated(uint64 maxAge);
    event PausedSet(bool paused);

    modifier onlyOracle(uint8 layer) {
        require(layerOracles[layer][msg.sender], "not oracle");
        _;
    }

    modifier onlyOffchainOracle() {
        require(offchainOracles[msg.sender], "not offchain oracle");
        _;
    }

    /// #invariant minSigners > 0;
    constructor() {
        cachedChainId = block.chainid;
        cachedDomainSeparator = _buildDomainSeparator();
        requireLayerDigest[L1] = true;
        requireLayerDigest[L2] = true;
        requireLayerDigest[L3] = true;
        maxLayerAge[L1] = 10 minutes;
        maxLayerAge[L2] = 10 minutes;
        maxLayerAge[L3] = 10 minutes;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
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
        uint64 maxAttestationAge_,
        bool requireOffchainDigest_,
        uint256 minSigners_
    ) external onlyOwner {
        require(minSigners_ > 0, "minSigners=0");
        minConfidenceBps = minConfidenceBps_;
        maxAttestationAge = maxAttestationAge_;
        requireOffchainDigest = requireOffchainDigest_;
        minSigners = minSigners_;
        emit PolicyUpdated(minConfidenceBps_, maxAttestationAge_, requireOffchainDigest_, minSigners_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function _validateAttestation(
        bytes32 structHash,
        AttestationInput memory input,
        bytes[] calldata signatures
    ) internal returns (bytes32) {
        require(!paused, "paused");
        require(input.validUntil >= input.issuedAt, "bad validity");
        require(input.issuedAt <= block.timestamp, "future");
        require(input.validUntil >= block.timestamp, "expired");
        require(block.timestamp - input.issuedAt <= maxAttestationAge, "stale");
        require(allowedModels[input.modelId], "model not allowed");
        uint32 modelMin = modelMinConfidenceBps[input.modelId];
        uint32 requiredConfidence = modelMin == 0 ? minConfidenceBps : modelMin;
        require(input.confidenceBps >= requiredConfidence, "low confidence");
        if (requireOffchainDigest) {
            _checkOffchainDigest(input.offchainDigest);
        }
        _checkLayerDigest(L1, input.l1Digest);
        _checkLayerDigest(L2, input.l2Digest);
        _checkLayerDigest(L3, input.l3Digest);

        bytes32 attestationHash = _hashTypedData(structHash);
        require(!usedAttestations[attestationHash], "attestation used");
        _validateSignatures(attestationHash, signatures);
        _recordAttestation(attestationHash);
        return attestationHash;
    }

    /// #if_succeeds old(usedAttestations[attestationHash]) == false ==> usedAttestations[attestationHash] == true;
    function _recordAttestation(bytes32 attestationHash) internal {
        usedAttestations[attestationHash] = true;
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

    function _validateSignatures(bytes32 attestationHash, bytes[] calldata signatures) internal view {
        require(signatures.length >= minSigners, "signatures");
        address[] memory seen = new address[](signatures.length);
        uint256 valid;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recoverSigner(attestationHash, signatures[i]);
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

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
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
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "sig");
        return signer;
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        if (block.chainid == cachedChainId) {
            return cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function _requireLayer(uint8 layer) internal pure {
        require(layer == L1 || layer == L2 || layer == L3, "layer");
    }
}
