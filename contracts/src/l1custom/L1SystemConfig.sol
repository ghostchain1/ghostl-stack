// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import {LibErrors} from "../common/LibErrors.sol";

/// @notice Minimal SystemConfig-like contract to hold rollup runtime params.
contract L1SystemConfig {
    event BatcherUpdated(address indexed batcher);
    event UnsafeBlockSignerUpdated(address indexed signer);
    event GasConfigUpdated(uint256 gasLimit, uint256 overhead, uint256 scalar);

    address public owner;
    address public batcher;
    address public unsafeBlockSigner;
    uint256 public gasLimit;
    uint256 public overhead;
    uint256 public scalar;

    modifier onlyOwner() {
        if (msg.sender != owner) revert LibErrors.NotOwner();
        _;
    }

    constructor(address _batcher, address _unsafeBlockSigner, uint256 _gasLimit, uint256 _overhead, uint256 _scalar) {
        owner = msg.sender;
        batcher = _batcher;
        unsafeBlockSigner = _unsafeBlockSigner;
        gasLimit = _gasLimit;
        overhead = _overhead;
        scalar = _scalar;
    }

    function setBatcher(address _batcher) external onlyOwner {
        batcher = _batcher;
        emit BatcherUpdated(_batcher);
    }

    function setUnsafeBlockSigner(address _signer) external onlyOwner {
        unsafeBlockSigner = _signer;
        emit UnsafeBlockSignerUpdated(_signer);
    }

    function setGasConfig(uint256 _gasLimit, uint256 _overhead, uint256 _scalar) external onlyOwner {
        gasLimit = _gasLimit;
        overhead = _overhead;
        scalar = _scalar;
        emit GasConfigUpdated(_gasLimit, _overhead, _scalar);
    }
}
