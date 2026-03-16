// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/GRC2981.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { GRC165 } from "./GRC165.sol";
import { IGRC165 } from "./IGRC165.sol";

/*
    Standard: GRC2981
    Name: Ghost Request for Comments 2981 — NFT Royalty Standard
    Compatible With: ERC2981
    Network: GhostChain L1 / GhostL2 / GhostL3
*/

/// @title IGRC2981
/// @notice Royalty info interface — mirrors ERC-2981 for GRC-721 / GRC-1155 tokens.
interface IGRC2981 is IGRC165 {
    /// @notice Called with the sale price to determine how much royalty is owed
    ///         and to whom.
    /// @param tokenId    The NFT asset queried for royalty information.
    /// @param salePrice  The sale price of the NFT asset specified by `tokenId`.
    /// @return receiver        Address of who should be paid the royalty.
    /// @return royaltyAmount   The royalty payment amount for `salePrice`.
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}

/// @title GRC2981
/// @notice GhostChain NFT royalty standard — abstract base for GRC-721 and GRC-1155 tokens.
///
///         Supports:
///           • Global default royalty — applies to all token IDs.
///           • Per-token royalty override — overrides the default for a specific ID.
///
///         Royalty denominator is 10_000 (basis points), so 500 = 5%.
///         Maximum royalty is capped at 100% (10_000 bps) to prevent abuse.
///
/// @dev Inherit alongside GRC-721 or GRC-1155.  Call `_setDefaultRoyalty` and/or
///      `_setTokenRoyalty` from the owning contract's constructor or admin functions.
abstract contract GRC2981 is GRC165, IGRC2981 {
    // ─────────────────────── Types ────────────────────────────────────────────

    struct RoyaltyInfo {
        address receiver;
        uint96  royaltyFraction; // basis points (out of 10_000)
    }

    // ─────────────────────── Constants ───────────────────────────────────────

    /// @notice Denominator for royalty fractions (basis points).
    uint96 public constant ROYALTY_DENOMINATOR = 10_000;

    // ─────────────────────── Storage ─────────────────────────────────────────

    RoyaltyInfo private _defaultRoyaltyInfo;

    /// @dev Per-token royalty; zero receiver means "use default".
    mapping(uint256 => RoyaltyInfo) private _tokenRoyaltyInfo;

    // ─────────────────────── Init ────────────────────────────────────────────

    constructor() {
        _registerInterface(type(IGRC2981).interfaceId);
    }

    // ─────────────────────── IGRC2981 ────────────────────────────────────────

    /// @inheritdoc IGRC2981
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        public
        view
        virtual
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        RoyaltyInfo memory ri = _tokenRoyaltyInfo[tokenId].receiver != address(0)
            ? _tokenRoyaltyInfo[tokenId]
            : _defaultRoyaltyInfo;

        receiver      = ri.receiver;
        royaltyAmount = (salePrice * ri.royaltyFraction) / ROYALTY_DENOMINATOR;
    }

    // ─────────────────────── Internal setters ────────────────────────────────

    /// @dev Set the global default royalty.  Call from the owning contract's constructor
    ///      or an admin-gated setter.
    /// @param receiver   Royalty recipient (must not be address(0)).
    /// @param feeNumerator  Royalty in basis points (e.g. 500 = 5%).  Max 10_000.
    function _setDefaultRoyalty(address receiver, uint96 feeNumerator) internal {
        require(receiver != address(0),        "GRC2981: zero receiver");
        require(feeNumerator <= ROYALTY_DENOMINATOR, "GRC2981: fee exceeds max");
        _defaultRoyaltyInfo = RoyaltyInfo({ receiver: receiver, royaltyFraction: feeNumerator });
    }

    /// @dev Delete the global default royalty — royaltyInfo returns (address(0), 0) by default.
    function _deleteDefaultRoyalty() internal {
        delete _defaultRoyaltyInfo;
    }

    /// @dev Set a per-token royalty override for `tokenId`.
    function _setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) internal {
        require(receiver != address(0),        "GRC2981: zero receiver");
        require(feeNumerator <= ROYALTY_DENOMINATOR, "GRC2981: fee exceeds max");
        _tokenRoyaltyInfo[tokenId] = RoyaltyInfo({ receiver: receiver, royaltyFraction: feeNumerator });
    }

    /// @dev Reset per-token royalty for `tokenId` — falls back to the global default.
    function _resetTokenRoyalty(uint256 tokenId) internal {
        delete _tokenRoyaltyInfo[tokenId];
    }
}
