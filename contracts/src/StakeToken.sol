// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

/// @notice Minimal ERC20 used as a rootchain stake token for Polygon Edge PolyBFT devnets.
contract StakeToken is ERC20 {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address ownerAddr, uint256 initialSupply) ERC20("Ghost Stake Token", "GSTK", 18) {
        owner = ownerAddr;
        _mint(ownerAddr, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
