// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Emergency circuit breaker that can be consulted by off-chain agents.
contract EmergencyShutdown is Ownable {
    bool public shutdown;
    string public reason;

    event Shutdown(bool shutdown, string reason);

    function trigger(string calldata _reason) external onlyOwner {
        shutdown = true;
        reason = _reason;
        emit Shutdown(true, _reason);
    }

    function clear() external onlyOwner {
        shutdown = false;
        reason = "";
        emit Shutdown(false, "");
    }
}
