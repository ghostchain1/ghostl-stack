// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Merkle.sol";

/// @notice Minimal optimistic settlement contract for a "child chain" (e.g. L2 on L1, L3 on L2).
/// A proposer posts Merkle roots of child block hashes for a contiguous block range.
/// After a challenge window, unchallenged batches become finalized.
/// If challenged, an admin (owner) resolves in this MVP (placeholder for real fraud proofs / bisection game).
contract OptimisticRollup {
    using Merkle for bytes32;

    address public owner;
    address public proposer;
    uint256 public immutable childChainId;
    uint256 public immutable challengePeriodSeconds;

    struct Batch {
        uint256 startBlock;
        uint256 endBlock;
        bytes32 root;
        uint256 proposedAt;
        bool challenged;
        bool finalized;
        bool invalidated;
    }

    Batch[] public batches;

    event OwnerChanged(address indexed owner);
    event ProposerChanged(address indexed proposer);
    event BatchProposed(uint256 indexed batchId, uint256 indexed startBlock, uint256 indexed endBlock, bytes32 root);
    event BatchChallenged(uint256 indexed batchId, address indexed challenger, string reason);
    event BatchFinalized(uint256 indexed batchId);
    event BatchInvalidated(uint256 indexed batchId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyProposer() {
        require(msg.sender == proposer, "not proposer");
        _;
    }

    constructor(uint256 childChainId_, uint256 challengePeriodSeconds_, address proposer_) {
        owner = msg.sender;
        proposer = proposer_;
        childChainId = childChainId_;
        challengePeriodSeconds = challengePeriodSeconds_;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setProposer(address newProposer) external onlyOwner {
        proposer = newProposer;
        emit ProposerChanged(newProposer);
    }

    function batchesLength() external view returns (uint256) {
        return batches.length;
    }

    function proposeBatch(uint256 startBlock, uint256 endBlock, bytes32 root) external onlyProposer returns (uint256 batchId) {
        require(endBlock >= startBlock, "range");
        require(root != bytes32(0), "root");

        if (batches.length > 0) {
            Batch storage prev = batches[batches.length - 1];
            require(startBlock == prev.endBlock + 1, "non-contiguous");
            require(!prev.invalidated, "prev invalidated");
        }

        batchId = batches.length;
        batches.push(
            Batch({
                startBlock: startBlock,
                endBlock: endBlock,
                root: root,
                proposedAt: block.timestamp,
                challenged: false,
                finalized: false,
                invalidated: false
            })
        );

        emit BatchProposed(batchId, startBlock, endBlock, root);
    }

    function challengeBatch(uint256 batchId, string calldata reason) external {
        Batch storage b = batches[batchId];
        require(!b.finalized, "finalized");
        require(!b.invalidated, "invalidated");
        b.challenged = true;
        emit BatchChallenged(batchId, msg.sender, reason);
    }

    function finalizeBatch(uint256 batchId) external {
        Batch storage b = batches[batchId];
        require(!b.finalized, "finalized");
        require(!b.invalidated, "invalidated");
        require(!b.challenged, "challenged");
        require(block.timestamp >= b.proposedAt + challengePeriodSeconds, "challenge window");
        b.finalized = true;
        emit BatchFinalized(batchId);
    }

    /// @notice MVP admin resolution for challenged batches (placeholder for real fraud proofs).
    function resolveChallenge(uint256 batchId, bool acceptBatch) external onlyOwner {
        Batch storage b = batches[batchId];
        require(b.challenged, "not challenged");
        require(!b.finalized, "finalized");
        require(!b.invalidated, "invalidated");
        if (acceptBatch) {
            b.finalized = true;
            emit BatchFinalized(batchId);
        } else {
            b.invalidated = true;
            emit BatchInvalidated(batchId);
        }
    }

    function verifyBlockInBatch(
        uint256 batchId,
        uint256 blockNumber,
        bytes32 blockHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        Batch storage b = batches[batchId];
        if (!b.finalized) return false;
        if (blockNumber < b.startBlock || blockNumber > b.endBlock) return false;
        uint256 index = blockNumber - b.startBlock;
        bytes32 leaf = Merkle.hashLeaf(blockNumber, blockHash);
        return Merkle.verify(b.root, leaf, proof, index);
    }
}

