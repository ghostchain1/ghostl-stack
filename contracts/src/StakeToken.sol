// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

/// @notice Minimal ERC20 used as a rootchain stake token for Polygon Edge PolyBFT devnets.
contract StakeToken is ERC20 {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address ownerAddr, uint256 initialSupply) ERC20("Ghost Stake Token", "GSTK", 18) {
        if (ownerAddr == address(0)) revert ZeroAddress();
        owner = ownerAddr;
        emit OwnershipTransferred(address(0), ownerAddr);
        if (initialSupply > 0) {
            _mint(ownerAddr, initialSupply);
        }
    }

    /// @notice Transfer ownership to a new address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Mint additional tokens (owner only).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn caller's own tokens.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
