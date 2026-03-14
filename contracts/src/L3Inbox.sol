// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./common/GhostHash.sol";

/// @notice Minimal L3 receiver for mirrored L2 finalization events.
/// This is an MVP "inbox" that simply marks messages as processed.
contract L3Inbox {
    address public owner;
    address public relayer;

    mapping(bytes32 => bool) public processed;

    event OwnerChanged(address indexed owner);
    event RelayerChanged(address indexed relayer);
    event FinalizedFromL2(address indexed from, address indexed to, uint256 amount, uint256 nonce, bytes32 key);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    constructor(address relayerAddr) {
        owner = msg.sender;
        relayer = relayerAddr;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerChanged(newRelayer);
    }

    function finalizeFromL2(address from, address to, uint256 amount, uint256 nonce) external onlyRelayer {
        bytes32 key = GhostHash.bridgeNativeKey(from, to, amount, nonce);
        require(!processed[key], "already");
        processed[key] = true;
        emit FinalizedFromL2(from, to, amount, nonce, key);
    }
}

