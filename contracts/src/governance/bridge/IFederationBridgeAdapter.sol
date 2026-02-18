// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal bridge adapter interface used by federation governance.
/// @dev The only assumptions are:
/// - authenticated source sender (address)
/// - a source domain id (uint256)
/// - message execution on destination
interface IFederationBridgeAdapter {
    /// @notice Source domain id this adapter represents (e.g., GhostL2=2, GhostL3=3).
    function sourceDomainId() external view returns (uint256);
}

