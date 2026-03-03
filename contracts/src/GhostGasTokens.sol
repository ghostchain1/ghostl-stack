// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

/// @title GhostGasTokenBase
/// @notice Base gas-token used by GhostChain L2 and L3 deployments.
/// @dev The previous constructor guard (`msg.sender == CANONICAL_GAS_TOKEN`) made the contract
///      permanently undeployable. Replaced with a standard Ownable + minter pattern.
///      `initialSupply` is now minted to the deployer at construction.
contract GhostGasTokenBase is ERC20 {
    /// @notice Canonical GhostChain gas-token address on L1 (informational; used by bridges).
    address public constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    address public owner;
    mapping(address => bool) public minters;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterChanged(address indexed account, bool allowed);

    error NotOwner();
    error NotMinter();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name_, symbol_, decimals_) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /// @notice Transfer ownership to `newOwner`. Zero address rejected.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Grant or revoke minting rights for `account`.
    function setMinter(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        minters[account] = allowed;
        emit MinterChanged(account, allowed);
    }

    /// @notice Mint `amount` tokens to `to`. Caller must be a minter.
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    /// @notice Burn `amount` of caller's own tokens (reduces totalSupply).
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Burn `amount` from `from`; minter must have sufficient allowance.
    function burnFrom(address from, uint256 amount) external onlyMinter {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _burn(from, amount);
    }
}

contract GhostGasTokenL2 is GhostGasTokenBase {
    constructor(uint256 initialSupply)
        GhostGasTokenBase("Ghost Token", "GST", 18, initialSupply)
    {}
}

contract GhostGasTokenL3 is GhostGasTokenBase {
    constructor(uint256 initialSupply)
        GhostGasTokenBase("Ghost Token", "GST", 18, initialSupply)
    {}
}
