// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Merkle.sol";

interface IStateRootFinalityOracle {
    function isStateRootFinalized(bytes32 stateRoot) external view returns (bool);
    function isPolicyHashAccepted(bytes32 aiPolicyHash) external view returns (bool);
}

/// @notice Minimal optimistic settlement contract for a "child chain" (e.g. L2 on L1, L3 on L2).
/// A proposer posts Merkle roots of child block hashes for a contiguous block range.
/// After a challenge window, unchallenged batches become finalized.
/// If challenged, an admin (owner) resolves in this MVP (placeholder for real fraud proofs / bisection game).
///
/// Optional cascading-finality mode:
/// - If `parentFinalityOracle` is configured, `finalizeBatch` requires:
///   1) child root finalized in parent oracle
///   2) batch policy hash present and accepted by parent oracle
contract OptimisticRollup {
    using Merkle for bytes32;

    address public owner;
    address public proposer;
    uint256 public immutable childChainId;
    uint256 public immutable challengePeriodSeconds;

    IStateRootFinalityOracle public parentFinalityOracle;

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
    mapping(uint256 => bytes32) public batchPolicyHash;

    event OwnerChanged(address indexed owner);
    event ProposerChanged(address indexed proposer);
    event ParentFinalityOracleChanged(address indexed oracle);
    event BatchPolicyHashUpdated(uint256 indexed batchId, bytes32 indexed policyHash);
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
        require(newOwner != address(0), "owner=0");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setProposer(address newProposer) external onlyOwner {
        require(newProposer != address(0), "proposer=0");
        proposer = newProposer;
        emit ProposerChanged(newProposer);
    }

    function setParentFinalityOracle(address oracle) external onlyOwner {
        // oracle == address(0) disables the oracle; allowed intentionally.
        parentFinalityOracle = IStateRootFinalityOracle(oracle);
        emit ParentFinalityOracleChanged(oracle);
    }

    function setBatchPolicyHash(uint256 batchId, bytes32 policyHash) external onlyProposer {
        require(batchId < batches.length, "batch");
        require(policyHash != bytes32(0), "policy hash");
        batchPolicyHash[batchId] = policyHash;
        emit BatchPolicyHashUpdated(batchId, policyHash);
    }

    function batchesLength() external view returns (uint256) {
        return batches.length;
    }

    function proposeBatch(uint256 startBlock, uint256 endBlock, bytes32 root) external onlyProposer returns (uint256 batchId) {
        batchId = _proposeBatch(startBlock, endBlock, root);
    }

    function proposeBatchWithPolicy(uint256 startBlock, uint256 endBlock, bytes32 root, bytes32 policyHash)
        external
        onlyProposer
        returns (uint256 batchId)
    {
        require(policyHash != bytes32(0), "policy hash");
        batchId = _proposeBatch(startBlock, endBlock, root);
        batchPolicyHash[batchId] = policyHash;
        emit BatchPolicyHashUpdated(batchId, policyHash);
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

        IStateRootFinalityOracle oracle = parentFinalityOracle;
        if (address(oracle) != address(0)) {
            require(oracle.isStateRootFinalized(b.root), "PARENT_ROOT_NOT_FINALIZED");
            bytes32 policyHash = batchPolicyHash[batchId];
            require(policyHash != bytes32(0), "POLICY_HASH_MISSING");
            require(oracle.isPolicyHashAccepted(policyHash), "POLICY_HASH_MISMATCH");
        }

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

    function _proposeBatch(uint256 startBlock, uint256 endBlock, bytes32 root) internal returns (uint256 batchId) {
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
}
