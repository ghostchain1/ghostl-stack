// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghost/GhostReentrancyGuard.sol)
pragma solidity ^0.8.24;

/**
 * @title  GhostReentrancyGuard
 * @notice GhostChain-native reentrancy protection.
 *         Drop-in replacement for OpenZeppelin ReentrancyGuard.
 *         Uses the same two-slot sentinel pattern; ABI-transparent.
 */
abstract contract GhostReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    uint256 private _status;

    error GhostReentrancyGuard__ReentrantCall();

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert GhostReentrancyGuard__ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
