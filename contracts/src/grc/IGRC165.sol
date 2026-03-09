// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/IGRC165.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

/*
    Standard: GRC165
    Name: Ghost Request for Comments 165
    Compatible With: ERC165
    Network: GhostChain L1 / GhostL2 / GhostL3
*/

/// @title IGRC165
/// @notice GhostChain interface-detection standard (GRC-165).
///         Any contract that wishes to advertise which interfaces it implements
///         MUST implement this interface.
///
///         ABI-identical to ERC-165 so that all existing tooling (explorers,
///         bridges, SDKs) works without modification.
interface IGRC165 {
    /// @notice Query if a contract implements an interface.
    /// @param interfaceId  The 4-byte interface identifier as defined in GRC-165.
    /// @return `true` if the contract implements `interfaceId` and
    ///         `interfaceId` is not 0xffffffff.
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
