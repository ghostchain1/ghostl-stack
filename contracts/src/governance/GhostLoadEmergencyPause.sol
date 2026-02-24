// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GhostLoadEmergencyPause {
    address public guardian;
    bool public paused;

    event Paused(address indexed guardian);
    event Unpaused(address indexed guardian);
    event GuardianChanged(address indexed guardian);

    error Unauthorized();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert Unauthorized();
        _;
    }

    constructor(address guardian_) {
        guardian = guardian_;
    }

    function setGuardian(address guardian_) external onlyGuardian {
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    function pause() external onlyGuardian {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyGuardian {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
