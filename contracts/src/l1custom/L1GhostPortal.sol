// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import {LibErrors} from "../common/LibErrors.sol";

/// @notice Minimal GhostChain portal to emit deposit events and expose a version string.
// slither-disable-next-line locked-ether
contract L1GhostPortal {
    event TransactionDeposited(address indexed from, address indexed to, uint256 value, uint256 gasLimit, bool isCreation, bytes data);
    event Paused();
    event Unpaused();

    address public owner;
    bool public paused;
    address public systemConfig;

    modifier onlyOwner() {
        if (msg.sender != owner) revert LibErrors.NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert LibErrors.NotAuthorized();
        _;
    }

    constructor(address _systemConfig) {
        owner = msg.sender;
        systemConfig = _systemConfig;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function depositTransaction(address to, uint256 gasLimit, bool isCreation, bytes calldata data) external payable whenNotPaused {
        emit TransactionDeposited(msg.sender, to, msg.value, gasLimit, isCreation, data);
    }

    function version() external pure returns (string memory) {
        return "1.0.0-custom";
    }
}
