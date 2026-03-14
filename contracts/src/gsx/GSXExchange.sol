// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import "./ComplianceRegistry.sol";
import "./InstitutionalIdentity.sol";

/// @title  GSXExchange
/// @notice Core sovereign exchange registry for GhostChain Sovereign Exchange (GSX).
///         Restricted to approved institutions: governments, central banks, sovereign funds.
contract GSXExchange {

    ComplianceRegistry    public immutable compliance;
    InstitutionalIdentity public immutable identity;

    address public admin;

    struct Market {
        bytes32 baseAsset;
        bytes32 quoteAsset;
        bool    active;
        uint256 totalVolume;
    }

    mapping(bytes32 => Market) public markets;
    bytes32[] public marketIds;

    event MarketCreated(bytes32 indexed id, bytes32 base, bytes32 quote);
    event MarketStatusChanged(bytes32 indexed id, bool active);
    event VolumeRecorded(bytes32 indexed id, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "GSX: not admin");
        _;
    }

    modifier onlyApproved() {
        require(compliance.isApproved(msg.sender), "GSX: not approved institution");
        _;
    }

    constructor(address _compliance, address _identity) {
        admin      = msg.sender;
        compliance = ComplianceRegistry(_compliance);
        identity   = InstitutionalIdentity(_identity);
    }

    function createMarket(bytes32 base, bytes32 quote)
        external onlyAdmin returns (bytes32 id)
    {
        id = keccak256(abi.encode(base, quote));
        require(!markets[id].active, "GSX: market exists");
        markets[id] = Market({ baseAsset: base, quoteAsset: quote, active: true, totalVolume: 0 });
        marketIds.push(id);
        emit MarketCreated(id, base, quote);
    }

    function setMarketStatus(bytes32 id, bool active) external onlyAdmin {
        markets[id].active = active;
        emit MarketStatusChanged(id, active);
    }

    function recordVolume(bytes32 id, uint256 amount) external onlyAdmin {
        markets[id].totalVolume += amount;
        emit VolumeRecorded(id, amount);
    }

    function marketCount() external view returns (uint256) { return marketIds.length; }
}
