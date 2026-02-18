// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Validator-weight voting power interface (snapshot-capable).
interface IValidatorSetVotes {
    function getValidatorVotes(address operator, uint256 timepoint) external view returns (uint256);
}

