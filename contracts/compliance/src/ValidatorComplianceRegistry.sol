// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

contract ValidatorComplianceRegistry {
    address public owner;

    struct Score {
        uint8 value;
        bytes32 policyPackHash;
        uint64 updatedAt;
    }

    mapping(address => Score) private scores;

    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event ScoreUpdated(address indexed validator, uint8 score, bytes32 policyPackHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "not_owner");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero_owner");
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function setScore(address validator, uint8 score, bytes32 policyPackHash) external onlyOwner {
        require(score <= 100, "score_range");
        scores[validator] = Score({ value: score, policyPackHash: policyPackHash, updatedAt: uint64(block.timestamp) });
        emit ScoreUpdated(validator, score, policyPackHash);
    }

    function getScore(address validator) external view returns (uint8 value, bytes32 policyPackHash, uint64 updatedAt) {
        Score memory entry = scores[validator];
        return (entry.value, entry.policyPackHash, entry.updatedAt);
    }
}
