// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ComplianceRegistry
/// @notice On-chain KYC/KYE, AML, and sanctions registry for GSX / GSN / GCM participants.
///         All institutions must be approved before they can trade or settle.
contract ComplianceRegistry {

    enum ComplianceStatus { Pending, Approved, Rejected, Watchlist, Sanctioned }

    struct Institution {
        string           name;
        string           jurisdiction;  // ISO-3166-1 alpha-2
        ComplianceStatus status;
        uint256          kycExpiry;
        uint256          riskScore;     // 0-100, lower = safer
        bool             amlCleared;
        address          complianceOfficer;
    }

    mapping(address => Institution) public institutions;
    mapping(address => bool)        public complianceOfficers;
    address public admin;

    event InstitutionRegistered(address indexed institution, string name, string jurisdiction);
    event StatusChanged(address indexed institution, ComplianceStatus status);
    event KYCApproved(address indexed institution, uint256 expiry, uint256 riskScore);
    event SanctionApplied(address indexed institution);
    event SanctionLifted(address indexed institution);
    event OfficerAdded(address indexed officer);

    modifier onlyAdmin()   { require(msg.sender == admin, "Compliance: not admin"); _; }
    modifier onlyOfficer() { require(complianceOfficers[msg.sender] || msg.sender == admin, "Compliance: not officer"); _; }

    constructor() {
        admin = msg.sender;
        complianceOfficers[msg.sender] = true;
    }

    function addOfficer(address officer) external onlyAdmin {
        complianceOfficers[officer] = true;
        emit OfficerAdded(officer);
    }

    function registerInstitution(
        address institution,
        string memory name,
        string memory jurisdiction
    ) external onlyOfficer {
        institutions[institution] = Institution({
            name:               name,
            jurisdiction:       jurisdiction,
            status:             ComplianceStatus.Pending,
            kycExpiry:          0,
            riskScore:          100,
            amlCleared:         false,
            complianceOfficer:  msg.sender
        });
        emit InstitutionRegistered(institution, name, jurisdiction);
    }

    function approveKYC(address institution, uint256 kycDuration, uint256 riskScore)
        external onlyOfficer
    {
        Institution storage inst = institutions[institution];
        inst.kycExpiry  = block.timestamp + kycDuration;
        inst.riskScore  = riskScore;
        inst.amlCleared = true;
        inst.status     = ComplianceStatus.Approved;
        emit KYCApproved(institution, inst.kycExpiry, riskScore);
        emit StatusChanged(institution, ComplianceStatus.Approved);
    }

    function rejectKYC(address institution) external onlyOfficer {
        institutions[institution].status = ComplianceStatus.Rejected;
        emit StatusChanged(institution, ComplianceStatus.Rejected);
    }

    function applySanction(address institution) external onlyOfficer {
        institutions[institution].status = ComplianceStatus.Sanctioned;
        frozen[institution] = true;
        emit SanctionApplied(institution);
        emit StatusChanged(institution, ComplianceStatus.Sanctioned);
    }

    function liftSanction(address institution) external onlyOfficer {
        institutions[institution].status = ComplianceStatus.Pending;
        frozen[institution] = false;
        emit SanctionLifted(institution);
    }

    mapping(address => bool) public frozen;

    function isApproved(address institution) external view returns (bool) {
        Institution storage inst = institutions[institution];
        return inst.status == ComplianceStatus.Approved
            && inst.kycExpiry > block.timestamp
            && inst.amlCleared
            && !frozen[institution];
    }
}
