// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IGRC721
 * @notice Ghost NFT Standard — GRC721 (replaces ERC721).
 * @dev All GhostStack non-fungible tokens must implement this interface.
 */
interface IGRC721 {
    /// @notice Emitted when a token is transferred.
    event GhostTransfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /// @notice Emitted when an operator approval is changed.
    event GhostApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @notice Emitted when a single token approval is set.
    event GhostApproval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    /// @notice Returns the token name.
    function name() external view returns (string memory);

    /// @notice Returns the token symbol.
    function symbol() external view returns (string memory);

    /// @notice Returns the URI for `tokenId` metadata.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @notice Returns the number of tokens owned by `owner`.
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Returns the owner of `tokenId`.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Returns the approved address for `tokenId`.
    function getApproved(uint256 tokenId) external view returns (address);

    /// @notice Returns true if `operator` is approved to manage all of `owner`'s tokens.
    function isApprovedForAll(address owner, address operator) external view returns (bool);

    /// @notice Approves `to` to manage `tokenId`.
    function approve(address to, uint256 tokenId) external;

    /// @notice Sets or unsets approval for `operator` to manage all caller tokens.
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Transfers `tokenId` from `from` to `to`.
    function transferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Safe-transfers `tokenId` from `from` to `to`.
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Safe-transfers `tokenId` from `from` to `to` with `data`.
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
}
