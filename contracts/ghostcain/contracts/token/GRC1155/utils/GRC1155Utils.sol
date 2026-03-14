// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC1155/utils/GRC1155Utils.sol)

pragma solidity ^0.8.20;

import {IGRC1155Receiver} from "../IGRC1155Receiver.sol";
import {IGRC1155Errors} from "../../../interfaces/draft-IGRC6093.sol";

/**
 * @dev Library that provide common GRC-1155 utility functions.
 *
 * See https://eips.ghostchain.org/EIPS/eip-1155[GRC-1155].
 *
 * _Available since v5.1._
 */
library GRC1155Utils {
    /**
     * @dev Performs an acceptance check for the provided `operator` by calling {IGRC1155Receiver-onGRC1155Received}
     * on the `to` address. The `operator` is generally the address that initiated the token transfer (i.e. `msg.sender`).
     *
     * The acceptance call is not executed and treated as a no-op if the target address doesn't contain code (i.e. an EOA).
     * Otherwise, the recipient must implement {IGRC1155Receiver-onGRC1155Received} and return the acceptance magic value to accept
     * the transfer.
     */
    function checkOnGRC1155Received(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length > 0) {
            try IGRC1155Receiver(to).onGRC1155Received(operator, from, id, value, data) returns (bytes4 response) {
                if (response != IGRC1155Receiver.onGRC1155Received.selector) {
                    // Tokens rejected
                    revert IGRC1155Errors.GRC1155InvalidReceiver(to);
                }
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    // non-IGRC1155Receiver implementer
                    revert IGRC1155Errors.GRC1155InvalidReceiver(to);
                } else {
                    assembly ("memory-safe") {
                        revert(add(reason, 0x20), mload(reason))
                    }
                }
            }
        }
    }

    /**
     * @dev Performs a batch acceptance check for the provided `operator` by calling {IGRC1155Receiver-onGRC1155BatchReceived}
     * on the `to` address. The `operator` is generally the address that initiated the token transfer (i.e. `msg.sender`).
     *
     * The acceptance call is not executed and treated as a no-op if the target address doesn't contain code (i.e. an EOA).
     * Otherwise, the recipient must implement {IGRC1155Receiver-onGRC1155Received} and return the acceptance magic value to accept
     * the transfer.
     */
    function checkOnGRC1155BatchReceived(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) internal {
        if (to.code.length > 0) {
            try IGRC1155Receiver(to).onGRC1155BatchReceived(operator, from, ids, values, data) returns (
                bytes4 response
            ) {
                if (response != IGRC1155Receiver.onGRC1155BatchReceived.selector) {
                    // Tokens rejected
                    revert IGRC1155Errors.GRC1155InvalidReceiver(to);
                }
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    // non-IGRC1155Receiver implementer
                    revert IGRC1155Errors.GRC1155InvalidReceiver(to);
                } else {
                    assembly ("memory-safe") {
                        revert(add(reason, 0x20), mload(reason))
                    }
                }
            }
        }
    }
}
