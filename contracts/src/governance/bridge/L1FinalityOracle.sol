// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../common/Governed.sol";

/// @notice Sovereign L1 finality oracle storing GhostBFT-finalized L1 block commitments.
contract L1FinalityOracle is Governed {
    struct FinalizedBlock {
        bytes32 blockHash;
        bytes32 quorumCertHash;
        bytes32 aiPolicyHash;
        uint64 finalizedAt;
        bool exists;
    }

    mapping(uint256 => FinalizedBlock) public finalizedBlocks;
    mapping(bytes32 => bool) public acceptedPolicyHash;
    bool public finalityHalted;

    event PolicyHashUpdated(bytes32 indexed policyHash, bool allowed);
    event FinalityHaltUpdated(bool halted, address indexed executor);
    event L1BlockFinalized(
        uint256 indexed blockNumber,
        bytes32 indexed blockHash,
        bytes32 indexed quorumCertHash,
        bytes32 aiPolicyHash,
        uint64 finalizedAt
    );

    error InvalidBlockHash();
    error InvalidQuorumCert();
    error InvalidPolicyHash();
    error PolicyHashNotAllowed(bytes32 policyHash);
    error FinalityHalted();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setAcceptedPolicyHash(bytes32 policyHash, bool allowed) external onlyGovernance {
        if (policyHash == bytes32(0)) revert InvalidPolicyHash();
        acceptedPolicyHash[policyHash] = allowed;
        emit PolicyHashUpdated(policyHash, allowed);
    }

    function setFinalityHalted(bool halted) external onlyGovernance {
        finalityHalted = halted;
        emit FinalityHaltUpdated(halted, msg.sender);
    }

    function recordFinalizedBlock(uint256 blockNumber, bytes32 blockHash, bytes32 quorumCertHash, bytes32 aiPolicyHash)
        external
        onlyGovernance
    {
        if (finalityHalted) revert FinalityHalted();
        if (blockHash == bytes32(0)) revert InvalidBlockHash();
        if (quorumCertHash == bytes32(0)) revert InvalidQuorumCert();
        if (aiPolicyHash == bytes32(0)) revert InvalidPolicyHash();
        if (!acceptedPolicyHash[aiPolicyHash]) revert PolicyHashNotAllowed(aiPolicyHash);

        finalizedBlocks[blockNumber] = FinalizedBlock({
            blockHash: blockHash,
            quorumCertHash: quorumCertHash,
            aiPolicyHash: aiPolicyHash,
            finalizedAt: uint64(block.timestamp),
            exists: true
        });

        emit L1BlockFinalized(blockNumber, blockHash, quorumCertHash, aiPolicyHash, uint64(block.timestamp));
    }

    function isBlockFinalized(uint256 blockNumber, bytes32 blockHash) external view returns (bool) {
        FinalizedBlock memory entry = finalizedBlocks[blockNumber];
        if (!entry.exists) return false;
        return entry.blockHash == blockHash;
    }

    /// @notice Alias for generic settlement contracts expecting a root-style API.
    function isStateRootFinalized(bytes32 rootOrHash) external pure returns (bool) {
        // L1 oracle indexes by block number + hash, not by root hash. Keep strict false for generic callers.
        rootOrHash;
        return false;
    }

    function isPolicyHashAccepted(bytes32 aiPolicyHash) external view returns (bool) {
        return acceptedPolicyHash[aiPolicyHash];
    }

    function isFinalityHalted() external view returns (bool) {
        return finalityHalted;
    }
}
