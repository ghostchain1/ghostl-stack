// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/GRC165.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { IGRC165 } from "./IGRC165.sol";

/*
    Standard: GRC165
    Name: Ghost Request for Comments 165
    Compatible With: ERC165
    Network: GhostChain L1 / GhostL2 / GhostL3
*/

/// @title GRC165
/// @notice GhostChain interface-detection standard.
///         Abstract base that child contracts inherit; they register interface IDs
///         by calling `_registerInterface` in their constructor.
///
///         ABI-identical to ERC-165.
abstract contract GRC165 is IGRC165 {
    // ─────────────────────── Storage ─────────────────────────────────────────

    /// @dev interfaceId → supported flag.
    mapping(bytes4 => bool) private _supportedInterfaces;

    // ─────────────────────── Init ────────────────────────────────────────────

    constructor() {
        // Every contract that implements GRC165 inherently supports it.
        _registerInterface(type(IGRC165).interfaceId);
    }

    // ─────────────────────── IGRC165 ─────────────────────────────────────────

    /// @inheritdoc IGRC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return _supportedInterfaces[interfaceId];
    }

    // ─────────────────────── Internal ────────────────────────────────────────

    /// @dev Register support for `interfaceId`.
    ///      Call from child constructors for each implemented interface.
    ///      Reverts on the sentinel value 0xffffffff (GRC-165 spec).
    function _registerInterface(bytes4 interfaceId) internal {
        require(interfaceId != 0xffffffff, "GRC165: invalid interfaceId");
        _supportedInterfaces[interfaceId] = true;
    }
}
