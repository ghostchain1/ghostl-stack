// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract GhostGasTokenBase is ERC20 {
    /// @dev Canonical GhostChain gas token (L1) used across all layers.
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    error CanonicalGasTokenOnly(address canonical);

    address public owner;
    mapping(address => bool) public minters;

    event OwnerChanged(address indexed owner);
    event MinterChanged(address indexed account, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name_, symbol_, decimals_) {
        // Per-layer gas token deployment is forbidden. Use the canonical L1 token address.
        name_;
        symbol_;
        decimals_;
        initialSupply;
        if (msg.sender != CANONICAL_GAS_TOKEN) {
            revert CanonicalGasTokenOnly(CANONICAL_GAS_TOKEN);
        }
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterChanged(account, allowed);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}

contract GhostGasTokenL2 is GhostGasTokenBase {
    constructor(uint256 initialSupply)
        GhostGasTokenBase("Ghost Token", "GHOST", 18, initialSupply)
    {}
}

contract GhostGasTokenL3 is GhostGasTokenBase {
    constructor(uint256 initialSupply)
        GhostGasTokenBase("Ghost Token", "GHOST", 18, initialSupply)
    {}
}
