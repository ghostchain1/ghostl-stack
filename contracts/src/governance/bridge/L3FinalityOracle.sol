// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../common/Governed.sol";
import "./IFederationFinalityVerifier.sol";
import "./L1FinalityOracle.sol";
import "./L2FinalityOracle.sol";

/// @notice L3 finality oracle enforcing cascading finality: L3 root -> L2 root -> L1 finalized block.
contract L3FinalityOracle is Governed, IFederationFinalityVerifier {
    uint256 public constant SOURCE_DOMAIN_ID = 3;

    struct FinalizedL3Root {
        bytes32 l3StateRoot;
        uint256 l3BlockNumber;
        bytes32 parentL2StateRoot;
        uint256 parentL2BlockNumber;
        uint256 l1BlockNumber;
        bytes32 l1BlockHash;
        bytes32 aiPolicyHash;
        bytes32 finalityProofHash;
        uint64 finalizedAt;
        bool exists;
    }

    L1FinalityOracle public l1FinalityOracle;
    L2FinalityOracle public l2FinalityOracle;

    mapping(bytes32 => FinalizedL3Root) public finalizedL3Roots;
    mapping(bytes32 => bool) public acceptedProofHash;

    event L1FinalityOracleUpdated(address indexed oracle);
    event L2FinalityOracleUpdated(address indexed oracle);
    event L3RootFinalized(
        bytes32 indexed l3StateRoot,
        uint256 indexed l3BlockNumber,
        bytes32 indexed parentL2StateRoot,
        uint256 parentL2BlockNumber,
        uint256 l1BlockNumber,
        bytes32 l1BlockHash,
        bytes32 aiPolicyHash,
        bytes32 finalityProofHash
    );

    error InvalidRoot();
    error InvalidPolicyHash();
    error InvalidProofHash();
    error L2ParentNotFinalizedOnL1(bytes32 parentL2StateRoot);
    error L2CanonicalRootUnavailable(uint256 l2BlockNumber);
    error L2ParentBlockCanonicalMismatch(uint256 l2BlockNumber, bytes32 canonicalRoot, bytes32 providedParentRoot);
    error L1BlockNotFinalized(uint256 blockNumber, bytes32 blockHash);
    error PolicyHashMismatch(bytes32 aiPolicyHash);

    constructor(
        address governor_,
        address timelock_,
        L1FinalityOracle l1FinalityOracle_,
        L2FinalityOracle l2FinalityOracle_
    ) Governed(governor_, timelock_) {
        require(address(l1FinalityOracle_) != address(0), "l1Oracle=0");
        require(address(l2FinalityOracle_) != address(0), "l2Oracle=0");
        l1FinalityOracle = l1FinalityOracle_;
        l2FinalityOracle = l2FinalityOracle_;
        emit L1FinalityOracleUpdated(address(l1FinalityOracle_));
        emit L2FinalityOracleUpdated(address(l2FinalityOracle_));
    }

    function setL1FinalityOracle(L1FinalityOracle l1FinalityOracle_) external onlyGovernance {
        require(address(l1FinalityOracle_) != address(0), "l1Oracle=0");
        l1FinalityOracle = l1FinalityOracle_;
        emit L1FinalityOracleUpdated(address(l1FinalityOracle_));
    }

    function setL2FinalityOracle(L2FinalityOracle l2FinalityOracle_) external onlyGovernance {
        require(address(l2FinalityOracle_) != address(0), "l2Oracle=0");
        l2FinalityOracle = l2FinalityOracle_;
        emit L2FinalityOracleUpdated(address(l2FinalityOracle_));
    }

    function recordFinalizedL3Root(
        bytes32 l3StateRoot,
        uint256 l3BlockNumber,
        bytes32 parentL2StateRoot,
        uint256 parentL2BlockNumber,
        uint256 l1BlockNumber,
        bytes32 l1BlockHash,
        bytes32 aiPolicyHash,
        bytes32 finalityProofHash
    ) external onlyGovernance {
        if (l3StateRoot == bytes32(0)) revert InvalidRoot();
        if (parentL2StateRoot == bytes32(0)) revert InvalidRoot();
        if (aiPolicyHash == bytes32(0)) revert InvalidPolicyHash();
        if (finalityProofHash == bytes32(0)) revert InvalidProofHash();

        if (!l2FinalityOracle.isFinalizedOnL1(parentL2StateRoot)) {
            revert L2ParentNotFinalizedOnL1(parentL2StateRoot);
        }
        bytes32 canonicalParentRoot = l2FinalityOracle.canonicalRootByL2Block(parentL2BlockNumber);
        if (canonicalParentRoot == bytes32(0)) {
            revert L2CanonicalRootUnavailable(parentL2BlockNumber);
        }
        if (canonicalParentRoot != parentL2StateRoot) {
            revert L2ParentBlockCanonicalMismatch(parentL2BlockNumber, canonicalParentRoot, parentL2StateRoot);
        }
        if (!l1FinalityOracle.isBlockFinalized(l1BlockNumber, l1BlockHash)) {
            revert L1BlockNotFinalized(l1BlockNumber, l1BlockHash);
        }
        if (!l1FinalityOracle.isPolicyHashAccepted(aiPolicyHash)) {
            revert PolicyHashMismatch(aiPolicyHash);
        }

        finalizedL3Roots[l3StateRoot] = FinalizedL3Root({
            l3StateRoot: l3StateRoot,
            l3BlockNumber: l3BlockNumber,
            parentL2StateRoot: parentL2StateRoot,
            parentL2BlockNumber: parentL2BlockNumber,
            l1BlockNumber: l1BlockNumber,
            l1BlockHash: l1BlockHash,
            aiPolicyHash: aiPolicyHash,
            finalityProofHash: finalityProofHash,
            finalizedAt: uint64(block.timestamp),
            exists: true
        });

        acceptedProofHash[finalityProofHash] = true;

        emit L3RootFinalized(
            l3StateRoot,
            l3BlockNumber,
            parentL2StateRoot,
            parentL2BlockNumber,
            l1BlockNumber,
            l1BlockHash,
            aiPolicyHash,
            finalityProofHash
        );
    }

    function isFinalizedOnL2(bytes32 l3StateRoot) external view returns (bool) {
        return finalizedL3Roots[l3StateRoot].exists;
    }

    function isParentL2FinalizedOnL1(bytes32 parentL2StateRoot) external view returns (bool) {
        return l2FinalityOracle.isFinalizedOnL1(parentL2StateRoot);
    }

    function parentL2Root(bytes32 l3StateRoot) external view returns (bytes32) {
        return finalizedL3Roots[l3StateRoot].parentL2StateRoot;
    }

    function parentL2Block(bytes32 l3StateRoot) external view returns (uint256) {
        return finalizedL3Roots[l3StateRoot].parentL2BlockNumber;
    }

    function isStateRootFinalized(bytes32 l3StateRoot) external view returns (bool) {
        return finalizedL3Roots[l3StateRoot].exists;
    }

    function isFinalityProofAccepted(bytes32 finalityProofHash) external view returns (bool) {
        return acceptedProofHash[finalityProofHash];
    }

    function isPolicyHashAccepted(bytes32 aiPolicyHash) external view returns (bool) {
        return l1FinalityOracle.isPolicyHashAccepted(aiPolicyHash);
    }

    function verifyFinality(uint256 sourceDomainId, bytes32 finalityProofHash) external view override returns (bool) {
        if (sourceDomainId != SOURCE_DOMAIN_ID) return false;
        return acceptedProofHash[finalityProofHash];
    }
}
