// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProofVerifier {
    function verify(bytes32 subjectHash, bytes32 statement, bytes32 proofHash) external view returns (bool);
}

contract ComplianceProofRegistry {
    address public owner;
    mapping(address => bool) public issuers;
    IProofVerifier public verifier;

    struct ProofRecord {
        bytes32 proofHash;
        uint256 expiresAt;
    }

    mapping(bytes32 => mapping(bytes32 => ProofRecord)) private proofs;

    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event IssuerUpdated(address indexed issuer, bool allowed);
    event ProofRegistered(bytes32 indexed subjectHash, bytes32 indexed statement, bytes32 proofHash, uint256 expiresAt);
    event VerifierUpdated(address indexed verifier);

    modifier onlyOwner() {
        require(msg.sender == owner, "not_owner");
        _;
    }

    modifier onlyIssuer() {
        require(issuers[msg.sender], "not_issuer");
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

    function setIssuer(address issuer, bool allowed) external onlyOwner {
        issuers[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = IProofVerifier(_verifier);
        emit VerifierUpdated(_verifier);
    }

    function registerProof(bytes32 subjectHash, bytes32 statement, bytes32 proofHash, uint256 expiresAt) external onlyIssuer {
        require(proofHash != bytes32(0), "empty_proof");
        proofs[subjectHash][statement] = ProofRecord({ proofHash: proofHash, expiresAt: expiresAt });
        emit ProofRegistered(subjectHash, statement, proofHash, expiresAt);
    }

    function isProofValid(bytes32 subjectHash, bytes32 statement) external view returns (bool) {
        ProofRecord memory record = proofs[subjectHash][statement];
        if (record.proofHash == bytes32(0)) return false;
        if (record.expiresAt != 0 && block.timestamp > record.expiresAt) return false;
        if (address(verifier) == address(0)) return true;
        return verifier.verify(subjectHash, statement, record.proofHash);
    }
}
