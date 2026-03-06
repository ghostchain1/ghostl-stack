// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Simple global pause flag that downstream contracts/services can reference.
contract PauseGuardian is Ownable {
    bool public paused;
    event Paused(bool paused);

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }
}
