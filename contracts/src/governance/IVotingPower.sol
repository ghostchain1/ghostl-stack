// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Snapshot-capable voting power interface (timestamp or block-number based).
/// @dev Mirrors the OZ Votes interface shape but avoids an OZ dependency.
interface IVotingPower {
    function getVotes(address account, uint256 timepoint) external view returns (uint256);

    function clock() external view returns (uint48);

    function CLOCK_MODE() external view returns (string memory);
}

