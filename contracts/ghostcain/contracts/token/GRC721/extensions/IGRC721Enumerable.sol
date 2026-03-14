// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC721/extensions/IGRC721Enumerable.sol)

pragma solidity >=0.6.2;

import {IGRC721} from "../IGRC721.sol";

/**
 * @title GRC-721 Non-Fungible Token Standard, optional enumeration extension
 * @dev See https://eips.ghostchain.org/EIPS/eip-721
 */
interface IGRC721Enumerable is IGRC721 {
    /**
     * @dev Returns the total amount of tokens stored by the contract.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns a token ID owned by `owner` at a given `index` of its token list.
     * Use along with {balanceOf} to enumerate all of ``owner``'s tokens.
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);

    /**
     * @dev Returns a token ID at a given `index` of all the tokens stored by the contract.
     * Use along with {totalSupply} to enumerate all tokens.
     */
    function tokenByIndex(uint256 index) external view returns (uint256);
}
