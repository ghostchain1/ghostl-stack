// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./L3BridgedToken.sol";

/// @notice Deploys and tracks a dedicated L3 bridged token for each L2 ERC20.
/// The offchain relayer can deploy tokens on demand and then mint/burn is routed
/// through the individual token contracts.
contract L3BridgedTokenFactory {
    address public owner;
    address public relayer;

    mapping(address => address) public l3TokenForL2Token;
    address[] public l2Tokens;

    event OwnerChanged(address indexed owner);
    event RelayerChanged(address indexed relayer);
    event BridgedTokenDeployed(
        address indexed l2Token,
        address indexed l3Token,
        string name,
        string symbol,
        uint8 decimals
    );

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

    function getOrDeployBridgedToken(
        address l2Token,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external onlyRelayer returns (address token) {
        token = l3TokenForL2Token[l2Token];
        if (token != address(0)) return token;

        L3BridgedToken t = new L3BridgedToken(owner, relayer, l2Token, name, symbol, decimals);
        token = address(t);
        l3TokenForL2Token[l2Token] = token;
        l2Tokens.push(l2Token);

        emit BridgedTokenDeployed(l2Token, token, name, symbol, decimals);
    }

    function l2TokensLength() external view returns (uint256) {
        return l2Tokens.length;
    }
}
