// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/AccessControl.sol";

/// @title GDPRegistry — on-chain record of sovereign GDP submissions
contract GDPRegistry {

    struct GDPRecord {
        uint256 value;       // in USD cents (18 decimals expected)
        uint256 timestamp;
        string  currency;    // ISO-4217 e.g. "USD"
        string  period;      // e.g. "2026-Q1"
    }

    mapping(address => GDPRecord[]) public gdpHistory;
    mapping(address => string)      public nationName;

    address public governance;

    event GDPRecorded(address indexed nation, uint256 value, string period);
    event NationRegistered(address indexed nation, string name);

    modifier onlyGovernance() {
        require(msg.sender == governance, "GDPRegistry: not governance");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
    }

    function registerNation(address nation, string calldata name) external onlyGovernance {
        nationName[nation] = name;
        emit NationRegistered(nation, name);
    }

    function recordGDP(
        uint256 value,
        string calldata currency,
        string calldata period
    ) external {
        require(bytes(nationName[msg.sender]).length > 0, "GDPRegistry: unregistered nation");
        gdpHistory[msg.sender].push(GDPRecord(value, block.timestamp, currency, period));
        emit GDPRecorded(msg.sender, value, period);
    }

    function latestGDP(address nation) external view returns (GDPRecord memory) {
        GDPRecord[] storage h = gdpHistory[nation];
        require(h.length > 0, "GDPRegistry: no records");
        return h[h.length - 1];
    }

    function historyLength(address nation) external view returns (uint256) {
        return gdpHistory[nation].length;
    }
}
