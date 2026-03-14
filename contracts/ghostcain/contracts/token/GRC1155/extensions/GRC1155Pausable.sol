// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC1155/extensions/GRC1155Pausable.sol)

pragma solidity ^0.8.24;

import {GRC1155} from "../GRC1155.sol";
import {Pausable} from "../../../utils/Pausable.sol";

/**
 * @dev GRC-1155 token with pausable token transfers, minting and burning.
 *
 * Useful for scenarios such as preventing trades until the end of an evaluation
 * period, or having an emergency switch for freezing all token transfers in the
 * event of a large bug.
 *
 * IMPORTANT: This contract does not include public pause and unpause functions. In
 * addition to inheriting this contract, you must define both functions, invoking the
 * {Pausable-_pause} and {Pausable-_unpause} internal functions, with appropriate
 * access control, e.g. using {AccessControl} or {Ownable}. Not doing so will
 * make the contract pause mechanism of the contract unreachable, and thus unusable.
 */
abstract contract GRC1155Pausable is GRC1155, Pausable {
    /**
     * @dev See {GRC1155-_update}.
     *
     * Requirements:
     *
     * - the contract must not be paused.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override whenNotPaused {
        super._update(from, to, ids, values);
    }
}
