// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveController
/// @notice Allows central banks to manage sovereign reserves on-chain.
///         Tracks gold, currency, commodity, and strategic reserves per bank.
contract ReserveController {

    struct ReserveEntry {
        bytes32 assetType;    // e.g. keccak256("GOLD"), keccak256("OIL")
        string  assetName;
        uint256 quantity;
        uint256 lastAudit;
        bool    active;
    }

    mapping(address => mapping(bytes32 => ReserveEntry)) public reserves;
    mapping(address => bytes32[])                        public bankReserveIds;
    mapping(address => bool)                             public authorizedBanks;
    address public admin;

    event ReserveRegistered(address indexed bank, bytes32 indexed assetType, string assetName, uint256 quantity);
    event ReserveUpdated(address indexed bank, bytes32 indexed assetType, uint256 newQuantity);
    event ReserveAudited(address indexed bank, bytes32 indexed assetType, uint256 quantity, uint256 timestamp);

    modifier onlyAdmin() { require(msg.sender == admin, "ReserveCtrl: not admin"); _; }
    modifier onlyAuthorized() {
        require(authorizedBanks[msg.sender] || msg.sender == admin, "ReserveCtrl: not authorized");
        _;
    }

    constructor() { admin = msg.sender; authorizedBanks[msg.sender] = true; }

    function authorizeBank(address bank, bool auth) external onlyAdmin {
        authorizedBanks[bank] = auth;
    }

    function registerReserve(
        bytes32 assetType,
        string memory assetName,
        uint256 quantity
    ) external onlyAuthorized {
        reserves[msg.sender][assetType] = ReserveEntry({
            assetType: assetType,
            assetName: assetName,
            quantity:  quantity,
            lastAudit: block.timestamp,
            active:    true
        });
        bankReserveIds[msg.sender].push(assetType);
        emit ReserveRegistered(msg.sender, assetType, assetName, quantity);
    }

    function updateReserve(bytes32 assetType, uint256 newQuantity) external onlyAuthorized {
        reserves[msg.sender][assetType].quantity = newQuantity;
        emit ReserveUpdated(msg.sender, assetType, newQuantity);
    }

    function auditReserve(address bank, bytes32 assetType) external onlyAdmin {
        ReserveEntry storage r = reserves[bank][assetType];
        r.lastAudit = block.timestamp;
        emit ReserveAudited(bank, assetType, r.quantity, block.timestamp);
    }

    function getReserve(address bank, bytes32 assetType)
        external view returns (uint256 quantity, uint256 lastAudit, bool active)
    {
        ReserveEntry storage r = reserves[bank][assetType];
        return (r.quantity, r.lastAudit, r.active);
    }
}
