// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Mutable chain config params (e.g., fork blocks) for devnet use.
contract ChainConfig is Ownable {
    mapping(bytes32 => uint256) public configUints;
    event ConfigSet(bytes32 indexed key, uint256 value);

    function setConfig(bytes32 key, uint256 value) external onlyOwner {
        configUints[key] = value;
        emit ConfigSet(key, value);
    }

    function getConfig(bytes32 key) external view returns (uint256) {
        return configUints[key];
    }
}
