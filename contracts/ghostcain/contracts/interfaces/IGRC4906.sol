// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/IGRC4906.sol)

pragma solidity >=0.6.2;

import {IGST165} from "./IGST165.sol";
import {IGRC721} from "./IGRC721.sol";

/// @title GRC-721 Metadata Update Extension
interface IGRC4906 is IGST165, IGRC721 {
    /// @dev This event emits when the metadata of a token is changed.
    /// So that the third-party platforms such as NFT market could
    /// timely update the images and related attributes of the NFT.
    event MetadataUpdate(uint256 _tokenId);

    /// @dev This event emits when the metadata of a range of tokens is changed.
    /// So that the third-party platforms such as NFT market could
    /// timely update the images and related attributes of the NFTs.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
}
