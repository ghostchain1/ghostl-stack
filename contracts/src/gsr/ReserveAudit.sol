// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveAudit
/// @notice Independent audit and attestation system for sovereign strategic reserves.
///         Provides on-chain proof of reserve existence and quantity.
contract ReserveAudit {

    struct AuditReport {
        bytes32 reserveId;
        address auditor;
        uint256 verifiedQuantity;
        string  evidenceHash;    // IPFS hash of audit documentation
        string  methodology;     // physical inspection / satellite / IoT
        uint256 auditedAt;
        bool    passed;
        string  notes;
    }

    mapping(bytes32 => AuditReport[]) public reports;         // reserveId -> audit history
    mapping(address => bool)          public certifiedAuditors;
    address public admin;

    event AuditCompleted(
        bytes32 indexed reserveId,
        address auditor,
        uint256 verifiedQuantity,
        bool    passed,
        uint256 timestamp
    );
    event AuditorCertified(address indexed auditor);
    event AuditorRevoked(address indexed auditor);

    modifier onlyAdmin()   { require(msg.sender == admin, "Audit: not admin"); _; }
    modifier onlyAuditor() { require(certifiedAuditors[msg.sender], "Audit: not certified auditor"); _; }

    constructor() {
        admin = msg.sender;
        certifiedAuditors[msg.sender] = true;
    }

    function certifyAuditor(address a) external onlyAdmin {
        certifiedAuditors[a] = true;
        emit AuditorCertified(a);
    }

    function revokeAuditor(address a) external onlyAdmin {
        certifiedAuditors[a] = false;
        emit AuditorRevoked(a);
    }

    function submitAudit(
        bytes32       reserveId,
        uint256       verifiedQuantity,
        string memory evidenceHash,
        string memory methodology,
        bool          passed,
        string memory notes
    ) external onlyAuditor {
        reports[reserveId].push(AuditReport({
            reserveId:         reserveId,
            auditor:           msg.sender,
            verifiedQuantity:  verifiedQuantity,
            evidenceHash:      evidenceHash,
            methodology:       methodology,
            auditedAt:         block.timestamp,
            passed:            passed,
            notes:             notes
        }));
        emit AuditCompleted(reserveId, msg.sender, verifiedQuantity, passed, block.timestamp);
    }

    function latestAudit(bytes32 reserveId)
        external view returns (AuditReport memory)
    {
        uint256 len = reports[reserveId].length;
        require(len > 0, "Audit: no reports");
        return reports[reserveId][len - 1];
    }

    function auditCount(bytes32 reserveId) external view returns (uint256) {
        return reports[reserveId].length;
    }
}
