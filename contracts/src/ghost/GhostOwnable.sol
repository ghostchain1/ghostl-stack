// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghost/GhostOwnable.sol)
pragma solidity ^0.8.24;

/**
 * @title  GhostOwnable
 * @notice GhostChain-native ownership control.
 *         Drop-in replacement for OpenZeppelin Ownable.
 *         ABI-compatible: owner(), onlyOwner, transferOwnership, renounceOwnership.
 */
abstract contract GhostOwnable {
    address private _owner;

    error GhostOwnable__NotOwner();
    error GhostOwnable__ZeroAddress();

    event GhostOwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert GhostOwnable__ZeroAddress();
        _owner = initialOwner;
        emit GhostOwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Returns the current owner address.
    function owner() public view returns (address) { return _owner; }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert GhostOwnable__NotOwner();
        _;
    }

    /// @notice Transfer ownership to a new address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert GhostOwnable__ZeroAddress();
        emit GhostOwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    /// @notice Renounce ownership — sets owner to address(0).
    function renounceOwnership() external onlyOwner {
        emit GhostOwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }
}
