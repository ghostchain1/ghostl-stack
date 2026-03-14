// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISovereignIdentity {
    function verifyIdentity(address wallet) external;
    function revokeIdentity(address wallet, string calldata reason) external;
    function isVerified(address wallet) external view returns (bool);
}

/// @title IdentityRegistry — manages verifiers and delegates verification authority
contract IdentityRegistry {

    ISovereignIdentity public sovereignIdentity;
    address public governance;

    mapping(address => bool) public authorisedVerifiers;
    mapping(address => uint256) public verificationCount;

    event VerifierAuthorised(address indexed verifier, bool status);
    event VerificationPerformed(address indexed verifier, address indexed subject);
    event RevocationPerformed(address indexed verifier, address indexed subject, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governance, "IdentityRegistry: not governance");
        _;
    }

    modifier onlyVerifier() {
        require(authorisedVerifiers[msg.sender] || msg.sender == governance,
            "IdentityRegistry: not authorised verifier");
        _;
    }

    constructor(address _sovereignIdentity, address _governance) {
        sovereignIdentity = ISovereignIdentity(_sovereignIdentity);
        governance = _governance;
    }

    function authoriseVerifier(address verifier, bool status) external onlyGovernance {
        authorisedVerifiers[verifier] = status;
        emit VerifierAuthorised(verifier, status);
    }

    function verify(address subject) external onlyVerifier {
        sovereignIdentity.verifyIdentity(subject);
        verificationCount[msg.sender]++;
        emit VerificationPerformed(msg.sender, subject);
    }

    function revoke(address subject, string calldata reason) external onlyVerifier {
        sovereignIdentity.revokeIdentity(subject, reason);
        emit RevocationPerformed(msg.sender, subject, reason);
    }

    function isVerified(address subject) external view returns (bool) {
        return sovereignIdentity.isVerified(subject);
    }
}
