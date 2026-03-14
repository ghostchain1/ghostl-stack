// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  GSXSettlement
/// @notice Receives trade-batch Merkle roots from the off-chain GSX matching engine
///         and records them immutably on GhostChain L1 for auditability and finality.
contract GSXSettlement {

    struct Batch {
        bytes32 merkleRoot;
        uint256 tradeCount;
        uint256 totalValue;
        address submitter;
        uint256 timestamp;
        bool    finalized;
    }

    Batch[]  public batches;
    mapping(address => bool) public authorizedSubmitters;
    address public admin;

    event BatchCommitted(uint256 indexed batchId, bytes32 root, uint256 count, uint256 totalValue);
    event BatchFinalized(uint256 indexed batchId);
    event SubmitterUpdated(address indexed submitter, bool authorized);

    modifier onlyAdmin()     { require(msg.sender == admin, "GSXSettlement: not admin"); _; }
    modifier onlySubmitter() { require(authorizedSubmitters[msg.sender], "GSXSettlement: not authorized"); _; }

    constructor() {
        admin = msg.sender;
        authorizedSubmitters[msg.sender] = true;
    }

    function setSubmitter(address sub, bool auth) external onlyAdmin {
        authorizedSubmitters[sub] = auth;
        emit SubmitterUpdated(sub, auth);
    }

    function commitBatch(bytes32 root, uint256 count, uint256 totalValue)
        external onlySubmitter returns (uint256 batchId)
    {
        batchId = batches.length;
        batches.push(Batch({
            merkleRoot: root,
            tradeCount: count,
            totalValue: totalValue,
            submitter:  msg.sender,
            timestamp:  block.timestamp,
            finalized:  false
        }));
        emit BatchCommitted(batchId, root, count, totalValue);
    }

    function finalizeBatch(uint256 batchId) external onlyAdmin {
        require(batchId < batches.length, "GSXSettlement: invalid batch");
        batches[batchId].finalized = true;
        emit BatchFinalized(batchId);
    }

    function batchCount() external view returns (uint256) { return batches.length; }
}
