// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IComplianceOracle {
    function isValidAttestation(
        address subject,
        bytes32 action,
        bytes32 paramsHash,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool);
}

contract ComplianceGuardExample {
    IComplianceOracle public oracle;

    error ComplianceDenied();
    error ComplianceExpired();

    constructor(address _oracle) {
        oracle = IComplianceOracle(_oracle);
    }

    modifier compliant(
        bytes32 action,
        bytes32 paramsHash,
        uint256 expiry,
        bytes calldata sig
    ) {
        if (block.timestamp > expiry) revert ComplianceExpired();
        bool ok = oracle.isValidAttestation(msg.sender, action, paramsHash, expiry, sig);
        if (!ok) revert ComplianceDenied();
        _;
    }

    // Example protected function
    function protectedTransfer(
        bytes32 paramsHash,
        uint256 expiry,
        bytes calldata sig
    ) external compliant(keccak256("TRANSFER"), paramsHash, expiry, sig) {
        // Your logic here (token transfer, bridge, mint, etc.)
    }
}
