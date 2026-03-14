// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IGRC1155
 * @notice Ghost Multi-Token Standard — GRC1155 (replaces ERC1155).
 * @dev Supports both fungible and non-fungible tokens in one contract.
 */
interface IGRC1155 {
    /// @notice Emitted when a single token type is transferred.
    event GhostTransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );

    /// @notice Emitted when a batch of tokens is transferred.
    event GhostTransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );

    /// @notice Emitted when approval status changes.
    event GhostApprovalForAll(address indexed account, address indexed operator, bool approved);

    /// @notice Returns the URI for token type `id`.
    function uri(uint256 id) external view returns (string memory);

    /// @notice Returns `account`'s balance of token type `id`.
    function balanceOf(address account, uint256 id) external view returns (uint256);

    /// @notice Batch-queries balances for multiple accounts and token IDs.
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external view returns (uint256[] memory);

    /// @notice Sets or unsets approval for `operator` to manage all caller tokens.
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Returns true if `operator` is approved to manage all of `account`'s tokens.
    function isApprovedForAll(address account, address operator) external view returns (bool);

    /// @notice Transfers `amount` of token `id` from `from` to `to`.
    function safeTransferFrom(
        address from, address to, uint256 id, uint256 amount, bytes calldata data
    ) external;

    /// @notice Batch-transfers multiple token types.
    function safeBatchTransferFrom(
        address from, address to, uint256[] calldata ids,
        uint256[] calldata amounts, bytes calldata data
    ) external;
}
