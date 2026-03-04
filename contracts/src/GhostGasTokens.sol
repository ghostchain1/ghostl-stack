// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";
import "./GhostBrand.sol";

contract GhostGasTokenBase is ERC20, GhostBrand {
    /// @dev Canonical GhostChain gas token address — must be deployed before this contract.
    address internal constant CANONICAL_GAS_TOKEN = CANONICAL_GST;

    /// @dev Authorized deployer EOA for initial chain setup.
    ///      After deployment, ownership should be transferred to CANONICAL_GAS_TOKEN.
    address internal constant AUTHORIZED_DEPLOYER  = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

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
        if (msg.sender != CANONICAL_GAS_TOKEN && msg.sender != AUTHORIZED_DEPLOYER) {
            revert CanonicalGasTokenOnly(CANONICAL_GAS_TOKEN);
        }
        owner = msg.sender;
        if (initialSupply > 0) _mint(msg.sender, initialSupply);
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
        GhostGasTokenBase("Ghost", "GST", 18, initialSupply)
    {}
}

contract GhostGasTokenL3 is GhostGasTokenBase {
    constructor(uint256 initialSupply)
        GhostGasTokenBase("Ghost", "GST", 18, initialSupply)
    {}
}
