// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SovereignIdentity — core on-chain identity registration for all entity types
contract SovereignIdentity {

    enum IdentityType {
        GOVERNMENT,
        CENTRAL_BANK,
        INSTITUTION,
        CORPORATION,
        CITIZEN,
        DEVICE,
        AI_AGENT
    }

    struct Identity {
        address  wallet;
        string   name;       // human-readable e.g. "gov.us.treasury"
        IdentityType idType;
        bool     verified;
        bool     active;
        uint256  registeredAt;
        address  verifiedBy;  // zero if unverified
    }

    mapping(address => Identity) public identities;
    mapping(string  => address)  public nameToAddress;  // GNS-style lookup

    address public governance;
    address public registry;  // IdentityRegistry contract

    event IdentityRegistered(address indexed wallet, string name, IdentityType idType);
    event IdentityVerified(address indexed wallet, address indexed verifier);
    event IdentityRevoked(address indexed wallet, string reason);
    event IdentityUpdated(address indexed wallet, string newName);

    modifier onlyGovernanceOrRegistry() {
        require(
            msg.sender == governance || msg.sender == registry,
            "SovereignIdentity: unauthorized"
        );
        _;
    }

    constructor(address _governance) {
        governance = _governance;
    }

    function setRegistry(address _registry) external {
        require(msg.sender == governance, "SovereignIdentity: not governance");
        registry = _registry;
    }

    function registerIdentity(
        string  calldata name,
        IdentityType idType
    ) external {
        require(bytes(name).length > 0, "SovereignIdentity: empty name");
        require(identities[msg.sender].registeredAt == 0, "SovereignIdentity: already registered");
        require(nameToAddress[name] == address(0), "SovereignIdentity: name taken");

        identities[msg.sender] = Identity({
            wallet:       msg.sender,
            name:         name,
            idType:       idType,
            verified:     false,
            active:       true,
            registeredAt: block.timestamp,
            verifiedBy:   address(0)
        });
        nameToAddress[name] = msg.sender;

        emit IdentityRegistered(msg.sender, name, idType);
    }

    function verifyIdentity(address wallet) external onlyGovernanceOrRegistry {
        Identity storage id = identities[wallet];
        require(id.registeredAt > 0, "SovereignIdentity: not registered");
        id.verified = true;
        id.verifiedBy = msg.sender;
        emit IdentityVerified(wallet, msg.sender);
    }

    function revokeIdentity(address wallet, string calldata reason)
        external onlyGovernanceOrRegistry
    {
        identities[wallet].active   = false;
        identities[wallet].verified = false;
        emit IdentityRevoked(wallet, reason);
    }

    function isVerified(address wallet) external view returns (bool) {
        Identity storage id = identities[wallet];
        return id.verified && id.active;
    }

    function resolve(string calldata name) external view returns (address) {
        return nameToAddress[name];
    }
}
