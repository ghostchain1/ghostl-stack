// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CredentialIssuer — on-chain verifiable credential issuance & revocation
contract CredentialIssuer {

    struct Credential {
        bytes32  credentialType;   // keccak256 e.g. keccak256("CENTRAL_BANK_LICENSE")
        address  subject;
        address  issuer;
        uint256  issuedAt;
        uint256  expiresAt;        // 0 = no expiry
        bool     revoked;
        bytes32  proofHash;        // hash of off-chain credential document
    }

    uint256 public nextCredentialId;
    mapping(uint256  => Credential)         public credentials;
    mapping(address  => uint256[])          public subjectCredentials;
    mapping(address  => bool)               public authorisedIssuers;

    address public governance;

    event IssuerAuthorised(address indexed issuer, bool status);
    event CredentialIssued(uint256 indexed id, bytes32 credType, address subject, address issuer);
    event CredentialRevoked(uint256 indexed id, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governance, "CredentialIssuer: not governance");
        _;
    }

    modifier onlyIssuer() {
        require(authorisedIssuers[msg.sender] || msg.sender == governance,
            "CredentialIssuer: not authorised issuer");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
        authorisedIssuers[_gov] = true;
    }

    function authoriseIssuer(address issuer, bool status) external onlyGovernance {
        authorisedIssuers[issuer] = status;
        emit IssuerAuthorised(issuer, status);
    }

    function issueCredential(
        bytes32  credentialType,
        address  subject,
        uint256  expiresAt,
        bytes32  proofHash
    ) external onlyIssuer returns (uint256 id) {
        id = nextCredentialId++;
        credentials[id] = Credential({
            credentialType: credentialType,
            subject:        subject,
            issuer:         msg.sender,
            issuedAt:       block.timestamp,
            expiresAt:      expiresAt,
            revoked:        false,
            proofHash:      proofHash
        });
        subjectCredentials[subject].push(id);
        emit CredentialIssued(id, credentialType, subject, msg.sender);
    }

    function revokeCredential(uint256 credentialId, string calldata reason)
        external onlyIssuer
    {
        Credential storage c = credentials[credentialId];
        require(!c.revoked, "CredentialIssuer: already revoked");
        require(c.issuer == msg.sender || msg.sender == governance,
            "CredentialIssuer: not issuer");
        c.revoked = true;
        emit CredentialRevoked(credentialId, reason);
    }

    function isCredentialValid(uint256 credentialId) external view returns (bool) {
        Credential storage c = credentials[credentialId];
        if (c.revoked) return false;
        if (c.expiresAt > 0 && block.timestamp > c.expiresAt) return false;
        return true;
    }

    function getSubjectCredentials(address subject) external view returns (uint256[] memory) {
        return subjectCredentials[subject];
    }
}
