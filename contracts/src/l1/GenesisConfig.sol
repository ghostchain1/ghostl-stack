// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

/// @notice Stores static genesis parameters for reference by off-chain tooling.
contract GenesisConfig {
    bytes32 public immutable genesisHash;
    uint256 public immutable timestamp;
    uint256 public immutable chainId;

    constructor(bytes32 _genesisHash, uint256 _timestamp, uint256 _chainId) {
        genesisHash = _genesisHash;
        timestamp = _timestamp;
        chainId = _chainId;
    }
}
