// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Simple role/flag keeper for admin gating.
contract Admin is Ownable {
    mapping(address => bool) public admins;

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner, "not admin");
        _;
    }

    function addAdmin(address who) external onlyOwner {
        admins[who] = true;
        emit AdminAdded(who);
    }

    function removeAdmin(address who) external onlyOwner {
        admins[who] = false;
        emit AdminRemoved(who);
    }
}
