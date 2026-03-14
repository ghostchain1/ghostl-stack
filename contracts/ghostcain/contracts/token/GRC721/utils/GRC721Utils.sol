// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC721/utils/GRC721Utils.sol)

pragma solidity ^0.8.20;

import {IGRC721Receiver} from "../IGRC721Receiver.sol";
import {IGRC721Errors} from "../../../interfaces/draft-IGRC6093.sol";

/**
 * @dev Library that provides common GRC-721 utility functions.
 *
 * See https://eips.ghostchain.org/EIPS/eip-721[GRC-721].
 *
 * _Available since v5.1._
 */
library GRC721Utils {
    /**
     * @dev Performs an acceptance check for the provided `operator` by calling {IGRC721Receiver-onGRC721Received}
     * on the `to` address. The `operator` is generally the address that initiated the token transfer (i.e. `msg.sender`).
     *
     * The acceptance call is not executed and treated as a no-op if the target address doesn't contain code (i.e. an EOA).
     * Otherwise, the recipient must implement {IGRC721Receiver-onGRC721Received} and return the acceptance magic value to accept
     * the transfer.
     */
    function checkOnGRC721Received(
        address operator,
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal {
        if (to.code.length > 0) {
            try IGRC721Receiver(to).onGRC721Received(operator, from, tokenId, data) returns (bytes4 retval) {
                if (retval != IGRC721Receiver.onGRC721Received.selector) {
                    // Token rejected
                    revert IGRC721Errors.GRC721InvalidReceiver(to);
                }
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    // non-IGRC721Receiver implementer
                    revert IGRC721Errors.GRC721InvalidReceiver(to);
                } else {
                    assembly ("memory-safe") {
                        revert(add(reason, 0x20), mload(reason))
                    }
                }
            }
        }
    }
}
