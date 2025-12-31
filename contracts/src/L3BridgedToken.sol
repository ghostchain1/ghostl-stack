// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract L3BridgedToken is ERC20 {
    address public owner;
    address public relayer;
    address public immutable l2Token;

    mapping(bytes32 => bool) public processed;

    event OwnerChanged(address indexed owner);
    event RelayerChanged(address indexed relayer);
    event MintedFromL2(address indexed from, address indexed to, uint256 amount, uint256 nonce, bytes32 key);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    constructor(address relayerAddr, address l2TokenAddr) ERC20("Ghost Token (L3)", "GHOST") {
        owner = msg.sender;
        relayer = relayerAddr;
        l2Token = l2TokenAddr;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerChanged(newRelayer);
    }

    function mintFromL2(address from, address to, uint256 amount, uint256 nonce) external onlyRelayer {
        bytes32 key = keccak256(abi.encode(l2Token, from, to, amount, nonce));
        require(!processed[key], "already");
        processed[key] = true;
        _mint(to, amount);
        emit MintedFromL2(from, to, amount, nonce, key);
    }
}

