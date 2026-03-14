// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  WorldFinanceRegistry
/// @notice Global institution registry for the Ghost World Finance Network (GWF).
///         Top-level coordination layer connecting all sovereign financial subsystems.
contract WorldFinanceRegistry {

    enum InstitutionClass {
        Government,     // National government treasury
        CentralBank,    // Central bank / monetary authority
        SovereignFund,  // Sovereign wealth fund
        TierOneBank,    // Tier-1 commercial bank
        Multilateral,   // IMF, World Bank, BIS
        Supranational   // EU, ASEAN, AU bodies
    }

    struct Institution {
        string           name;
        string           legalId;        // LEI or sovereign identifier
        InstitutionClass iClass;
        address          wallet;
        string           jurisdiction;
        bool             active;
        uint256          registeredAt;
        string           gnsName;        // Ghost Name Service handle
    }

    mapping(address => Institution) public institutions;
    mapping(bytes32 => address)     public gnsToAddress;
    address[]                       public institutionList;
    mapping(address => bool)        public registrars;
    address public admin;

    event InstitutionRegistered(address indexed wallet, string name, InstitutionClass iClass);
    event InstitutionDeactivated(address indexed wallet);
    event RegistrarAdded(address indexed registrar);

    modifier onlyAdmin()     { require(msg.sender == admin, "WFR: not admin"); _; }
    modifier onlyRegistrar() { require(registrars[msg.sender] || msg.sender == admin, "WFR: not registrar"); _; }

    constructor() {
        admin = msg.sender;
        registrars[msg.sender] = true;
    }

    function addRegistrar(address r) external onlyAdmin {
        registrars[r] = true;
        emit RegistrarAdded(r);
    }

    function register(
        address          wallet,
        string memory    name,
        string memory    legalId,
        InstitutionClass iClass,
        string memory    jurisdiction,
        string memory    gnsName
    ) external onlyRegistrar {
        bytes32 gnsHash = keccak256(bytes(gnsName));
        require(gnsToAddress[gnsHash] == address(0), "WFR: GNS name taken");
        institutions[wallet] = Institution({
            name:         name,
            legalId:      legalId,
            iClass:       iClass,
            wallet:       wallet,
            jurisdiction: jurisdiction,
            active:       true,
            registeredAt: block.timestamp,
            gnsName:      gnsName
        });
        gnsToAddress[gnsHash] = wallet;
        institutionList.push(wallet);
        emit InstitutionRegistered(wallet, name, iClass);
    }

    function deactivate(address wallet) external onlyRegistrar {
        institutions[wallet].active = false;
        emit InstitutionDeactivated(wallet);
    }

    function resolve(string memory gnsName) external view returns (address) {
        return gnsToAddress[keccak256(bytes(gnsName))];
    }

    function isActive(address wallet) external view returns (bool) {
        return institutions[wallet].active;
    }

    function institutionCount() external view returns (uint256) { return institutionList.length; }
}
