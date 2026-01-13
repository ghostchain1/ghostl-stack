// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Minimal SystemConfig-style contract to hold rollup configuration parameters.
contract SystemConfig is Ownable {
    struct GasConfig {
        uint256 gasLimit;
        uint256 overhead;
        uint256 scalar;
    }

    address public batcher;
    address public unsafeBlockSigner;
    GasConfig public gasConfig;

    event BatcherUpdated(address indexed newBatcher);
    event UnsafeBlockSignerUpdated(address indexed newSigner);
    event GasConfigUpdated(uint256 gasLimit, uint256 overhead, uint256 scalar);

    constructor(
        address _batcher,
        address _unsafeBlockSigner,
        uint256 _gasLimit,
        uint256 _overhead,
        uint256 _scalar
    ) {
        batcher = _batcher;
        unsafeBlockSigner = _unsafeBlockSigner;
        gasConfig = GasConfig({gasLimit: _gasLimit, overhead: _overhead, scalar: _scalar});
    }

    function setBatcher(address _batcher) external onlyOwner {
        require(_batcher != address(0), "batcher=0");
        batcher = _batcher;
        emit BatcherUpdated(_batcher);
    }

    function setUnsafeBlockSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "signer=0");
        unsafeBlockSigner = _signer;
        emit UnsafeBlockSignerUpdated(_signer);
    }

    function setGasConfig(uint256 gasLimit, uint256 overhead, uint256 scalar) external onlyOwner {
        gasConfig = GasConfig({gasLimit: gasLimit, overhead: overhead, scalar: scalar});
        emit GasConfigUpdated(gasLimit, overhead, scalar);
    }
}
