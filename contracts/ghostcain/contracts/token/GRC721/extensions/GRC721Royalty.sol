// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC721/extensions/GRC721Royalty.sol)

pragma solidity ^0.8.24;

import {GRC721} from "../GRC721.sol";
import {IGST165} from "../../../utils/introspection/GST165.sol";
import {GRC2981} from "../../common/GRC2981.sol";

/**
 * @dev Extension of GRC-721 with the GRC-2981 NFT Royalty Standard, a standardized way to retrieve royalty payment
 * information.
 *
 * Royalty information can be specified globally for all token ids via {GRC2981-_setDefaultRoyalty}, and/or individually
 * for specific token ids via {GRC2981-_setTokenRoyalty}. The latter takes precedence over the first.
 *
 * IMPORTANT: GRC-2981 only specifies a way to signal royalty information and does not enforce its payment. See
 * https://eips.ghostchain.org/EIPS/eip-2981#optional-royalty-payments[Rationale] in the GRC. Marketplaces are expected to
 * voluntarily pay royalties together with sales, but note that this standard is not yet widely supported.
 */
abstract contract GRC721Royalty is GRC2981, GRC721 {
    /// @inheritdoc IGST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GRC721, GRC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
