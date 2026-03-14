// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC1155/extensions/GRC1155Burnable.sol)

pragma solidity ^0.8.24;

import {GRC1155} from "../GRC1155.sol";

/**
 * @dev Extension of {GRC1155} that allows token holders to destroy both their
 * own tokens and those that they have been approved to use.
 */
abstract contract GRC1155Burnable is GRC1155 {
    function burn(address account, uint256 id, uint256 value) public virtual {
        if (account != _msgSender() && !isApprovedForAll(account, _msgSender())) {
            revert GRC1155MissingApprovalForAll(_msgSender(), account);
        }

        _burn(account, id, value);
    }

    function burnBatch(address account, uint256[] memory ids, uint256[] memory values) public virtual {
        if (account != _msgSender() && !isApprovedForAll(account, _msgSender())) {
            revert GRC1155MissingApprovalForAll(_msgSender(), account);
        }

        _burnBatch(account, ids, values);
    }
}
