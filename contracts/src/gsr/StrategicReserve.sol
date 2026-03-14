// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  StrategicReserve
/// @notice Core contract for the Ghost Strategic Reserves Network (GSR).
///         Governments tokenize and manage national strategic reserves.
///         Assets: gold, oil, gas, wheat, water, lithium, rare earth, infrastructure.
contract StrategicReserve {

    struct Reserve {
        string  name;
        string  category;    // GOLD, OIL, GAS, WHEAT, WATER, LITHIUM, INFRASTRUCTURE, RARE_EARTH
        string  location;    // physical storage location (e.g. "Fort Knox, USA")
        uint256 quantity;    // in standardized units (barrels, troy oz, metric tons, etc.)
        string  unit;        // barrels / troy_oz / metric_ton / litre / kwh
        address owner;       // sovereign entity
        bool    active;
        bool    verified;    // independently audited
        uint256 registeredAt;
        uint256 lastAuditAt;
    }

    mapping(bytes32 => Reserve) public reserves;
    bytes32[]                   public reserveIds;
    mapping(address => bool)    public authorizedOwners;
    mapping(address => bool)    public auditors;
    address public admin;

    event ReserveRegistered(bytes32 indexed id, string name, string category, uint256 quantity, address owner);
    event ReserveUpdated(bytes32 indexed id, uint256 newQuantity);
    event ReserveVerified(bytes32 indexed id, address auditor, uint256 timestamp);
    event ReserveDeactivated(bytes32 indexed id);

    modifier onlyAdmin()    { require(msg.sender == admin, "GSR: not admin"); _; }
    modifier onlyOwner(bytes32 id) {
        require(reserves[id].owner == msg.sender, "GSR: not owner");
        _;
    }
    modifier onlyAuditor()  { require(auditors[msg.sender] || msg.sender == admin, "GSR: not auditor"); _; }

    constructor() {
        admin = msg.sender;
        auditors[msg.sender] = true;
    }

    function authorizeOwner(address owner, bool auth) external onlyAdmin {
        authorizedOwners[owner] = auth;
    }

    function addAuditor(address auditor) external onlyAdmin {
        auditors[auditor] = true;
    }

    function registerReserve(
        string memory name,
        string memory category,
        string memory location,
        uint256       quantity,
        string memory unit
    ) external returns (bytes32 id) {
        require(authorizedOwners[msg.sender] || msg.sender == admin, "GSR: not authorized");
        id = keccak256(abi.encode(name, msg.sender, block.timestamp));
        reserves[id] = Reserve({
            name:         name,
            category:     category,
            location:     location,
            quantity:     quantity,
            unit:         unit,
            owner:        msg.sender,
            active:       true,
            verified:     false,
            registeredAt: block.timestamp,
            lastAuditAt:  0
        });
        reserveIds.push(id);
        emit ReserveRegistered(id, name, category, quantity, msg.sender);
    }

    function updateQuantity(bytes32 id, uint256 newQuantity) external onlyOwner(id) {
        reserves[id].quantity = newQuantity;
        emit ReserveUpdated(id, newQuantity);
    }

    function verifyReserve(bytes32 id) external onlyAuditor {
        reserves[id].verified    = true;
        reserves[id].lastAuditAt = block.timestamp;
        emit ReserveVerified(id, msg.sender, block.timestamp);
    }

    function deactivate(bytes32 id) external onlyAdmin {
        reserves[id].active = false;
        emit ReserveDeactivated(id);
    }

    function reserveCount() external view returns (uint256) { return reserveIds.length; }
}
