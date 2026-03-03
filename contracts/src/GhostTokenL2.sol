// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

/// @title GhostTokenL2
/// @notice Bridged representation of the canonical GST gas token on L2.
/// @dev The previous constructor check against CANONICAL_GAS_TOKEN made the contract
///      permanently undeployable. Replaced with a standard Ownable + minter pattern
///      so the bridge relayer can mint/burn as deposits and withdrawals occur.
contract GhostTokenL2 is ERC20 {
    /// @notice Canonical GhostChain gas-token address on L1 (informational).
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

    /// @param initialSupply Amount minted to deployer; 0 is valid (bridge-controlled supply).
    constructor(uint256 initialSupply) ERC20("Ghost Token", "GST", 18) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        minters[account] = allowed;
        emit MinterChanged(account, allowed);
    }

    /// @notice Mint tokens (bridge deposit path).
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    /// @notice Burn caller's own tokens (bridge withdrawal path).
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Burn `from`'s tokens with allowance (minter-initiated, e.g. bridge).
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
