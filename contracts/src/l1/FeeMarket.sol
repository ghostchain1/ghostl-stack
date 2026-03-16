// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Stores EIP-1559-style fee parameters; intended for off-chain components to read.
contract FeeMarket is Ownable {
    uint256 public baseFee;
    uint256 public elasticityMultiplier;
    uint256 public baseFeeChangeDenominator;

    event FeeParamsUpdated(uint256 baseFee, uint256 elasticityMultiplier, uint256 baseFeeChangeDenominator);

    constructor(uint256 _baseFee, uint256 _elasticityMultiplier, uint256 _denominator) {
        baseFee = _baseFee;
        elasticityMultiplier = _elasticityMultiplier;
        baseFeeChangeDenominator = _denominator;
    }

    function setFeeParams(uint256 _baseFee, uint256 _elasticityMultiplier, uint256 _denominator) external onlyOwner {
        baseFee = _baseFee;
        elasticityMultiplier = _elasticityMultiplier;
        baseFeeChangeDenominator = _denominator;
        emit FeeParamsUpdated(_baseFee, _elasticityMultiplier, _denominator);
    }
}
