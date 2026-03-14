// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  GSNSettlement
/// @notice Cross-border sovereign settlement contract for the Ghost Settlement Network.
///         Replaces slow correspondent-banking flows with T+0 on-chain finality.
contract GSNSettlement {

    struct Settlement {
        address sender;
        address receiver;
        uint256 amount;
        bytes32 asset;       // keccak256 of asset symbol, e.g. keccak256("USD-CBDC")
        string  purpose;     // human-readable purpose (energy, bonds, reserves, etc.)
        uint256 timestamp;
        bool    confirmed;
    }

    Settlement[] public settlements;
    mapping(address => bool) public authorizedNodes;  // Sovereign Gateway Nodes
    address public admin;

    event SettlementInitiated(
        uint256 indexed id,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        bytes32 asset,
        string  purpose
    );
    event SettlementConfirmed(uint256 indexed id);
    event NodeAuthorized(address indexed node, bool authorized);

    modifier onlyAdmin() { require(msg.sender == admin, "GSN: not admin"); _; }
    modifier onlyNode()  { require(authorizedNodes[msg.sender], "GSN: not authorized node"); _; }

    constructor() {
        admin = msg.sender;
        authorizedNodes[msg.sender] = true;
    }

    function setNodeAuthorization(address node, bool auth) external onlyAdmin {
        authorizedNodes[node] = auth;
        emit NodeAuthorized(node, auth);
    }

    function executeSettlement(
        address receiver,
        uint256 amount,
        bytes32 asset,
        string memory purpose
    ) external onlyNode returns (uint256 id) {
        id = settlements.length;
        settlements.push(Settlement({
            sender:    msg.sender,
            receiver:  receiver,
            amount:    amount,
            asset:     asset,
            purpose:   purpose,
            timestamp: block.timestamp,
            confirmed: false
        }));
        emit SettlementInitiated(id, msg.sender, receiver, amount, asset, purpose);
    }

    function confirmSettlement(uint256 id) external onlyAdmin {
        require(id < settlements.length, "GSN: invalid id");
        settlements[id].confirmed = true;
        emit SettlementConfirmed(id);
    }

    function settlementCount() external view returns (uint256) { return settlements.length; }
}
