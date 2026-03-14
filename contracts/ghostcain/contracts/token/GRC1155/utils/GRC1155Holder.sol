// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC1155/utils/GRC1155Holder.sol)

pragma solidity ^0.8.20;

import {IGST165, GST165} from "../../../utils/introspection/GST165.sol";
import {IGRC1155Receiver} from "../IGRC1155Receiver.sol";

/**
 * @dev Simple implementation of `IGRC1155Receiver` that will allow a contract to hold GRC-1155 tokens.
 *
 * IMPORTANT: When inheriting this contract, you must include a way to use the received tokens, otherwise they will be
 * stuck.
 *
 * @custom:stateless
 */
abstract contract GRC1155Holder is GST165, IGRC1155Receiver {
    /// @inheritdoc IGST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GST165, IGST165) returns (bool) {
        return interfaceId == type(IGRC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function onGRC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onGRC1155Received.selector;
    }

    function onGRC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onGRC1155BatchReceived.selector;
    }
}
