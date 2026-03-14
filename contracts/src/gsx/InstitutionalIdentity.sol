// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  InstitutionalIdentity
/// @notice Sovereign identity registry integrated with Ghost Name Service (GNS).
///         Maps GNS names (gov.us.treasury, bank.jpmorgan) to on-chain addresses.
contract InstitutionalIdentity {

    enum InstitutionType { Government, CentralBank, SovereignFund, IntelligenceAgency, Bank, Contractor }

    struct Identity {
        string          gnsName;       // e.g. "gov.us.treasury"
        string          legalName;
        InstitutionType iType;
        address         wallet;
        bool            active;
        uint256         registeredAt;
        string          jurisdiction;  // ISO-3166-1 alpha-2
    }

    mapping(address  => Identity) public identities;
    mapping(bytes32  => address)  public nameToAddress; // keccak256(gnsName) -> wallet
    mapping(address  => bool)     public registrars;
    address public admin;

    event IdentityRegistered(address indexed wallet, string gnsName, InstitutionType iType);
    event IdentityRevoked(address indexed wallet);
    event RegistrarAdded(address indexed registrar);

    modifier onlyAdmin()     { require(msg.sender == admin, "Identity: not admin"); _; }
    modifier onlyRegistrar() { require(registrars[msg.sender] || msg.sender == admin, "Identity: not registrar"); _; }

    constructor() {
        admin = msg.sender;
        registrars[msg.sender] = true;
    }

    function addRegistrar(address r) external onlyAdmin {
        registrars[r] = true;
        emit RegistrarAdded(r);
    }

    function register(
        address         wallet,
        string memory   gnsName,
        string memory   legalName,
        InstitutionType iType,
        string memory   jurisdiction
    ) external onlyRegistrar {
        bytes32 nameHash = keccak256(bytes(gnsName));
        require(nameToAddress[nameHash] == address(0), "Identity: name taken");
        identities[wallet] = Identity({
            gnsName:      gnsName,
            legalName:    legalName,
            iType:        iType,
            wallet:       wallet,
            active:       true,
            registeredAt: block.timestamp,
            jurisdiction: jurisdiction
        });
        nameToAddress[nameHash] = wallet;
        emit IdentityRegistered(wallet, gnsName, iType);
    }

    function revoke(address wallet) external onlyRegistrar {
        identities[wallet].active = false;
        emit IdentityRevoked(wallet);
    }

    function resolve(string memory gnsName) external view returns (address) {
        return nameToAddress[keccak256(bytes(gnsName))];
    }

    function isActive(address wallet) external view returns (bool) {
        return identities[wallet].active;
    }
}
