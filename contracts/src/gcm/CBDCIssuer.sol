// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import "./CentralBankRegistry.sol";

/// @title  CBDCIssuer
/// @notice Allows registered central banks to mint and manage CBDC supply.
///         Implements programmable monetary policy: supply caps, interest, velocity limits.
contract CBDCIssuer {

    CentralBankRegistry public immutable registry;

    struct CBDCAccount {
        uint256 balance;
        uint256 mintedTotal;
        uint256 burnedTotal;
        uint256 mintCap;       // maximum outstanding supply for this bank
        bool    paused;
    }

    mapping(address => CBDCAccount) public accounts;
    uint256 public globalSupply;

    event CBDCMinted(address indexed bank, uint256 amount, uint256 newSupply);
    event CBDCBurned(address indexed bank, uint256 amount, uint256 newSupply);
    event MintCapUpdated(address indexed bank, uint256 cap);
    event BankPaused(address indexed bank, bool paused);

    modifier onlyCentralBank() {
        require(registry.isCentralBank(msg.sender), "CBDCIssuer: not central bank");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == registry.governance(), "CBDCIssuer: not governance");
        _;
    }

    constructor(address _registry) {
        registry = CentralBankRegistry(_registry);
    }

    function setMintCap(address bank, uint256 cap) external onlyGovernance {
        accounts[bank].mintCap = cap;
        emit MintCapUpdated(bank, cap);
    }

    function setPaused(address bank, bool paused) external onlyGovernance {
        accounts[bank].paused = paused;
        emit BankPaused(bank, paused);
    }

    function mint(uint256 amount) external onlyCentralBank {
        CBDCAccount storage acc = accounts[msg.sender];
        require(!acc.paused, "CBDCIssuer: bank paused");
        if (acc.mintCap > 0) {
            require(acc.balance + amount <= acc.mintCap, "CBDCIssuer: mint cap exceeded");
        }
        acc.balance     += amount;
        acc.mintedTotal += amount;
        globalSupply    += amount;
        emit CBDCMinted(msg.sender, amount, globalSupply);
    }

    function burn(uint256 amount) external onlyCentralBank {
        CBDCAccount storage acc = accounts[msg.sender];
        require(acc.balance >= amount, "CBDCIssuer: insufficient balance");
        acc.balance     -= amount;
        acc.burnedTotal += amount;
        globalSupply    -= amount;
        emit CBDCBurned(msg.sender, amount, globalSupply);
    }

    function balanceOf(address bank) external view returns (uint256) {
        return accounts[bank].balance;
    }
}
