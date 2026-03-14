// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/IGRC2309.sol)

pragma solidity >=0.4.11;

/**
 * @dev GRC-2309: GRC-721 Consecutive Transfer Extension.
 */
interface IGRC2309 {
    /**
     * @dev Emitted when the tokens from `fromTokenId` to `toTokenId` are transferred from `fromAddress` to `toAddress`.
     */
    event ConsecutiveTransfer(
        uint256 indexed fromTokenId,
        uint256 toTokenId,
        address indexed fromAddress,
        address indexed toAddress
    );
}
