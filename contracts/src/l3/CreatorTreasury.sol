// GhostChain Contracts v5.6.1 (contracts/src/l3/CreatorTreasury.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";

/// @title CreatorTreasury
/// @notice Per-creator GST vault with deposit, withdraw, and staking on GhostL3.
contract CreatorTreasury is GhostBrand, GhostReentrancyGuard {
    error WrongChain(uint256 expected, uint256 actual);
    error InsufficientBalance(uint256 available, uint256 requested);
    error NotCreator();

    event Deposited(address indexed creator, uint256 amount);
    event Withdrawn(address indexed creator, uint256 amount);
    event Staked(address indexed creator, uint256 amount);
    event Unstaked(address indexed creator, uint256 amount);

    IGRC20 public immutable GST_TOKEN;

    struct Vault {
        uint256 balance;
        uint256 staked;
    }

    mapping(address => Vault) public vaults;

    constructor(address _gstToken) {
        require(_gstToken != address(0), "Invalid GST");
        GST_TOKEN = IGRC20(_gstToken);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        require(amount > 0, "Zero amount");
        require(GST_TOKEN.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        vaults[msg.sender].balance += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        Vault storage v = vaults[msg.sender];
        if (v.balance < amount) revert InsufficientBalance(v.balance, amount);
        v.balance -= amount;
        require(GST_TOKEN.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function stake(uint256 amount) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        Vault storage v = vaults[msg.sender];
        if (v.balance < amount) revert InsufficientBalance(v.balance, amount);
        v.balance -= amount;
        v.staked  += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        Vault storage v = vaults[msg.sender];
        if (v.staked < amount) revert InsufficientBalance(v.staked, amount);
        v.staked  -= amount;
        v.balance += amount;
        emit Unstaked(msg.sender, amount);
    }

    function getVault(address creator) external view returns (uint256 balance, uint256 staked) {
        Vault storage v = vaults[creator];
        return (v.balance, v.staked);
    }
}
