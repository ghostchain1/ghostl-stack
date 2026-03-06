// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/GST20.sol";
import "../common/Ownable.sol";

/// @notice Mintable/burnable native token for ghostchain economics.
contract NativeToken is GST20, Ownable {
    constructor(string memory _name, string memory _symbol) GST20(_name, _symbol, 18) {}

    /// #if_succeeds {:msg "only owner mint"} msg.sender == owner;
    /// #if_succeeds {:msg "totalSupply increases"} totalSupply == old(totalSupply) + amount;
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// #if_succeeds {:msg "only owner burn"} msg.sender == owner;
    /// #if_succeeds {:msg "totalSupply decreases"} totalSupply == old(totalSupply) - amount;
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
