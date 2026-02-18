// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../common/Governed.sol";
import "../../consensus-governance/ConsensusEvidenceRootStore.sol";
import "./IFederationFinalityVerifier.sol";
import "./L1FinalityOracle.sol";

/// @notice L2 finality oracle. A L2 root is accepted only if anchored to an L1-finalized block.
contract L2FinalityOracle is Governed, IFederationFinalityVerifier {
    uint256 public constant SOURCE_DOMAIN_ID = 2;
    bytes32 public constant KIND_L2_CANONICAL_DIVERGENCE = keccak256("ghost.consensus.l2.canonical.divergence");

    struct FinalizedL2Root {
        bytes32 l2StateRoot;
        uint256 l2BlockNumber;
        uint256 l1BlockNumber;
        bytes32 l1BlockHash;
        bytes32 aiPolicyHash;
        bytes32 finalityProofHash;
        uint64 finalizedAt;
        bool exists;
    }

    L1FinalityOracle public l1FinalityOracle;
    ConsensusEvidenceRootStore public evidenceRootStore;

    mapping(bytes32 => FinalizedL2Root) public finalizedL2Roots;
    mapping(uint256 => bytes32) public canonicalRootByL2Block;
    mapping(bytes32 => bool) public acceptedProofHash;

    event L1FinalityOracleUpdated(address indexed oracle);
    event EvidenceRootStoreUpdated(address indexed evidenceRootStore);
    event L2CanonicalRootBound(uint256 indexed l2BlockNumber, bytes32 indexed l2StateRoot, uint256 indexed l1BlockNumber);
    event L2CanonicalDivergenceReported(
        uint256 indexed l2BlockNumber,
        bytes32 indexed canonicalRoot,
        bytes32 indexed conflictingRoot,
        bytes32 evidenceHash,
        address reporter
    );
    event L2RootFinalized(
        bytes32 indexed l2StateRoot,
        uint256 indexed l2BlockNumber,
        uint256 indexed l1BlockNumber,
        bytes32 l1BlockHash,
        bytes32 aiPolicyHash,
        bytes32 finalityProofHash
    );
    event L2CanonicalDivergenceAnchored(
        uint256 indexed l2BlockNumber, bytes32 indexed evidenceHash, bytes32 indexed metadataHash, uint32 version
    );

    error InvalidRoot();
    error InvalidPolicyHash();
    error InvalidProofHash();
    error L1BlockNotFinalized(uint256 blockNumber, bytes32 blockHash);
    error PolicyHashMismatch(bytes32 aiPolicyHash);
    error L2CanonicalRootMismatch(uint256 l2BlockNumber, bytes32 canonicalRoot, bytes32 conflictingRoot);
    error CanonicalRootUnavailable(uint256 l2BlockNumber);
    error InvalidEvidenceHash();
    error L1FinalityHalted();

    constructor(address governor_, address timelock_, L1FinalityOracle l1FinalityOracle_) Governed(governor_, timelock_) {
        require(address(l1FinalityOracle_) != address(0), "l1Oracle=0");
        l1FinalityOracle = l1FinalityOracle_;
        emit L1FinalityOracleUpdated(address(l1FinalityOracle_));
    }

    function setL1FinalityOracle(L1FinalityOracle l1FinalityOracle_) external onlyGovernance {
        require(address(l1FinalityOracle_) != address(0), "l1Oracle=0");
        l1FinalityOracle = l1FinalityOracle_;
        emit L1FinalityOracleUpdated(address(l1FinalityOracle_));
    }

    function setEvidenceRootStore(ConsensusEvidenceRootStore evidenceRootStore_) external onlyGovernance {
        evidenceRootStore = evidenceRootStore_;
        emit EvidenceRootStoreUpdated(address(evidenceRootStore_));
    }

    function recordFinalizedL2Root(
        bytes32 l2StateRoot,
        uint256 l2BlockNumber,
        uint256 l1BlockNumber,
        bytes32 l1BlockHash,
        bytes32 aiPolicyHash,
        bytes32 finalityProofHash
    ) external onlyGovernance {
        if (l1FinalityOracle.isFinalityHalted()) revert L1FinalityHalted();
        if (l2StateRoot == bytes32(0)) revert InvalidRoot();
        if (aiPolicyHash == bytes32(0)) revert InvalidPolicyHash();
        if (finalityProofHash == bytes32(0)) revert InvalidProofHash();

        if (!l1FinalityOracle.isBlockFinalized(l1BlockNumber, l1BlockHash)) {
            revert L1BlockNotFinalized(l1BlockNumber, l1BlockHash);
        }
        if (!l1FinalityOracle.isPolicyHashAccepted(aiPolicyHash)) {
            revert PolicyHashMismatch(aiPolicyHash);
        }

        bytes32 canonicalRoot = canonicalRootByL2Block[l2BlockNumber];
        if (canonicalRoot == bytes32(0)) {
            canonicalRootByL2Block[l2BlockNumber] = l2StateRoot;
            emit L2CanonicalRootBound(l2BlockNumber, l2StateRoot, l1BlockNumber);
        } else if (canonicalRoot != l2StateRoot) {
            revert L2CanonicalRootMismatch(l2BlockNumber, canonicalRoot, l2StateRoot);
        }

        finalizedL2Roots[l2StateRoot] = FinalizedL2Root({
            l2StateRoot: l2StateRoot,
            l2BlockNumber: l2BlockNumber,
            l1BlockNumber: l1BlockNumber,
            l1BlockHash: l1BlockHash,
            aiPolicyHash: aiPolicyHash,
            finalityProofHash: finalityProofHash,
            finalizedAt: uint64(block.timestamp),
            exists: true
        });

        acceptedProofHash[finalityProofHash] = true;

        emit L2RootFinalized(l2StateRoot, l2BlockNumber, l1BlockNumber, l1BlockHash, aiPolicyHash, finalityProofHash);
    }

    /// @notice Records divergence evidence when a proposed root conflicts with the canonical root for an L2 block.
    /// @dev Returns true when a divergence was reported, false if the provided root equals the canonical root.
    function reportCanonicalRootDivergence(uint256 l2BlockNumber, bytes32 conflictingRoot, bytes32 evidenceHash)
        external
        onlyGovernance
        returns (bool)
    {
        if (l1FinalityOracle.isFinalityHalted()) revert L1FinalityHalted();
        if (conflictingRoot == bytes32(0)) revert InvalidRoot();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        bytes32 canonicalRoot = canonicalRootByL2Block[l2BlockNumber];
        if (canonicalRoot == bytes32(0)) revert CanonicalRootUnavailable(l2BlockNumber);
        if (canonicalRoot == conflictingRoot) return false;

        emit L2CanonicalDivergenceReported(l2BlockNumber, canonicalRoot, conflictingRoot, evidenceHash, msg.sender);

        ConsensusEvidenceRootStore store = evidenceRootStore;
        if (address(store) != address(0)) {
            bytes32 metadataHash = keccak256(abi.encode(l2BlockNumber, canonicalRoot, conflictingRoot));
            uint32 version = store.recordEvidenceRootByReporter(
                KIND_L2_CANONICAL_DIVERGENCE, evidenceHash, 0, 0, metadataHash
            );
            emit L2CanonicalDivergenceAnchored(l2BlockNumber, evidenceHash, metadataHash, version);
        }
        return true;
    }

    function isFinalizedOnL1(bytes32 l2StateRoot) external view returns (bool) {
        return finalizedL2Roots[l2StateRoot].exists;
    }

    function isStateRootFinalized(bytes32 l2StateRoot) external view returns (bool) {
        return finalizedL2Roots[l2StateRoot].exists;
    }

    function isFinalityProofAccepted(bytes32 finalityProofHash) external view returns (bool) {
        return acceptedProofHash[finalityProofHash];
    }

    function isPolicyHashAccepted(bytes32 aiPolicyHash) external view returns (bool) {
        return l1FinalityOracle.isPolicyHashAccepted(aiPolicyHash);
    }

    function isFinalityHalted() external view returns (bool) {
        return l1FinalityOracle.isFinalityHalted();
    }

    function verifyFinality(uint256 sourceDomainId, bytes32 finalityProofHash) external view override returns (bool) {
        if (sourceDomainId != SOURCE_DOMAIN_ID) return false;
        return acceptedProofHash[finalityProofHash];
    }
}
