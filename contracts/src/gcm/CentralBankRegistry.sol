// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  CentralBankRegistry
/// @notice Maintains the authoritative registry of central banks approved to operate
///         on the GhostChain Central Bank Network (GCM).
contract CentralBankRegistry {

    struct CentralBank {
        string  name;
        string  currency;      // e.g. "USD", "EUR", "JPY"
        string  jurisdiction;
        address wallet;
        bool    active;
        uint256 registeredAt;
    }

    mapping(address => CentralBank) public centralBanks;
    mapping(address => bool)        public isCentralBank;
    address[] public bankList;
    address public governance;

    event CentralBankRegistered(address indexed bank, string name, string currency);
    event CentralBankRevoked(address indexed bank);
    event GovernanceTransferred(address indexed from, address indexed to);

    modifier onlyGovernance() { require(msg.sender == governance, "CBR: not governance"); _; }

    constructor() { governance = msg.sender; }

    function transferGovernance(address newGov) external onlyGovernance {
        emit GovernanceTransferred(governance, newGov);
        governance = newGov;
    }

    function registerCentralBank(
        address bank,
        string memory name,
        string memory currency,
        string memory jurisdiction
    ) external onlyGovernance {
        require(!isCentralBank[bank], "CBR: already registered");
        isCentralBank[bank] = true;
        centralBanks[bank]  = CentralBank({
            name:         name,
            currency:     currency,
            jurisdiction: jurisdiction,
            wallet:       bank,
            active:       true,
            registeredAt: block.timestamp
        });
        bankList.push(bank);
        emit CentralBankRegistered(bank, name, currency);
    }

    function revokeCentralBank(address bank) external onlyGovernance {
        require(isCentralBank[bank], "CBR: not registered");
        centralBanks[bank].active = false;
        emit CentralBankRevoked(bank);
    }

    function bankCount() external view returns (uint256) { return bankList.length; }
}
