// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title InstitutionalIdentity — verified institutional participants for GSX/GSN/GCM
contract InstitutionalIdentity {

    enum InstitutionType {
        GOVERNMENT,
        CENTRAL_BANK,
        SOVEREIGN_FUND,
        TIER1_BANK,
        DEFENCE_CONTRACTOR,
        INTELLIGENCE_AGENCY,
        REGULATOR,
        AUDITOR
    }

    struct Institution {
        string          name;          // e.g. "bank.jpmorgan"
        string          legalName;     // full legal entity name
        InstitutionType instType;
        address         wallet;
        bytes32         jurisdictionHash; // keccak256 of ISO country code
        bool            approved;
        bool            suspended;
        uint256         approvedAt;
    }

    mapping(address => Institution) public institutions;
    mapping(string  => address)     public nameToWallet;
    address[] public institutionList;

    address public governance;
    mapping(address => bool) public approvers;

    event InstitutionRegistered(address indexed wallet, string name, InstitutionType instType);
    event InstitutionApproved(address indexed wallet, address indexed approver);
    event InstitutionSuspended(address indexed wallet, string reason);
    event InstitutionReinstated(address indexed wallet);

    modifier onlyGovernance() {
        require(msg.sender == governance, "InstitutionalIdentity: not governance");
        _;
    }

    modifier onlyApprover() {
        require(approvers[msg.sender] || msg.sender == governance,
            "InstitutionalIdentity: not approver");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
        approvers[_gov] = true;
    }

    function setApprover(address approver, bool status) external onlyGovernance {
        approvers[approver] = status;
    }

    function registerInstitution(
        string          calldata name,
        string          calldata legalName,
        InstitutionType instType,
        bytes32         jurisdictionHash
    ) external {
        require(bytes(name).length > 0, "InstitutionalIdentity: empty name");
        require(institutions[msg.sender].approvedAt == 0, "InstitutionalIdentity: duplicate");
        require(nameToWallet[name] == address(0), "InstitutionalIdentity: name taken");

        institutions[msg.sender] = Institution({
            name:             name,
            legalName:        legalName,
            instType:         instType,
            wallet:           msg.sender,
            jurisdictionHash: jurisdictionHash,
            approved:         false,
            suspended:        false,
            approvedAt:       0
        });
        nameToWallet[name] = msg.sender;
        institutionList.push(msg.sender);

        emit InstitutionRegistered(msg.sender, name, instType);
    }

    function approveInstitution(address wallet) external onlyApprover {
        Institution storage inst = institutions[wallet];
        require(!inst.approved, "InstitutionalIdentity: already approved");
        inst.approved   = true;
        inst.approvedAt = block.timestamp;
        emit InstitutionApproved(wallet, msg.sender);
    }

    function suspendInstitution(address wallet, string calldata reason) external onlyApprover {
        institutions[wallet].suspended = true;
        emit InstitutionSuspended(wallet, reason);
    }

    function reinstateInstitution(address wallet) external onlyGovernance {
        institutions[wallet].suspended = false;
        emit InstitutionReinstated(wallet);
    }

    function isApprovedInstitution(address wallet) external view returns (bool) {
        Institution storage inst = institutions[wallet];
        return inst.approved && !inst.suspended;
    }

    function institutionCount() external view returns (uint256) {
        return institutionList.length;
    }
}
