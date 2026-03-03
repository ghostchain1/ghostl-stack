// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract L3BridgedToken is ERC20 {
    address public owner;
    address public relayer;
    address public immutable l2Token;

    mapping(bytes32 => bool) public processed;
    mapping(bytes32 => bool) public burned;

    event OwnerChanged(address indexed owner);
    event RelayerChanged(address indexed relayer);
    event MintedFromL2(address indexed l2Token, address indexed from, address indexed to, uint256 amount, uint256 nonce, bytes32 key);
    event BurnInitiated(address indexed l2Token, address indexed from, address indexed to, uint256 amount, uint256 nonce, bytes32 key);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "not relayer");
        _;
    }

    constructor(
        address ownerAddr,
        address relayerAddr,
        address l2TokenAddr,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_, decimals_) {
        owner = ownerAddr;
        relayer = relayerAddr;
        l2Token = l2TokenAddr;
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "relayer=0");
        relayer = newRelayer;
        emit RelayerChanged(newRelayer);
    }

    function mintFromL2(address from, address to, uint256 amount, uint256 nonce) external onlyRelayer {
        bytes32 key = keccak256(abi.encode(l2Token, from, to, amount, nonce));
        require(!processed[key], "already");
        processed[key] = true;
        _mint(to, amount);
        emit MintedFromL2(l2Token, from, to, amount, nonce, key);
    }

    /// @notice Burn bridged tokens on L3 to release the escrowed L2 tokens to `to` (via relayer).
    function burnToL2(address to, uint256 amount, uint256 nonce) external {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        bytes32 key = keccak256(abi.encode(l2Token, msg.sender, to, amount, nonce));
        require(!burned[key], "already");
        burned[key] = true;
        _burn(msg.sender, amount);
        emit BurnInitiated(l2Token, msg.sender, to, amount, nonce, key);
    }
}
