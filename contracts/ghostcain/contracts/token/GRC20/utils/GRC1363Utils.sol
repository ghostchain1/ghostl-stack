// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC20/utils/GRC1363Utils.sol)

pragma solidity ^0.8.20;

import {IGRC1363Receiver} from "../../../interfaces/IGRC1363Receiver.sol";
import {IGRC1363Spender} from "../../../interfaces/IGRC1363Spender.sol";

/**
 * @dev Library that provides common GRC-1363 utility functions.
 *
 * See https://eips.ghostchain.org/EIPS/eip-1363[GRC-1363].
 */
library GRC1363Utils {
    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error GRC1363InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the token `spender`. Used in approvals.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     */
    error GRC1363InvalidSpender(address spender);

    /**
     * @dev Performs a call to {IGRC1363Receiver-onTransferReceived} on a target address.
     *
     * Requirements:
     *
     * - The target has code (i.e. is a contract).
     * - The target `to` must implement the {IGRC1363Receiver} interface.
     * - The target must return the {IGRC1363Receiver-onTransferReceived} selector to accept the transfer.
     */
    function checkOnGRC1363TransferReceived(
        address operator,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            revert GRC1363InvalidReceiver(to);
        }

        try IGRC1363Receiver(to).onTransferReceived(operator, from, value, data) returns (bytes4 retval) {
            if (retval != IGRC1363Receiver.onTransferReceived.selector) {
                revert GRC1363InvalidReceiver(to);
            }
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert GRC1363InvalidReceiver(to);
            } else {
                assembly ("memory-safe") {
                    revert(add(reason, 0x20), mload(reason))
                }
            }
        }
    }

    /**
     * @dev Performs a call to {IGRC1363Spender-onApprovalReceived} on a target address.
     *
     * Requirements:
     *
     * - The target has code (i.e. is a contract).
     * - The target `spender` must implement the {IGRC1363Spender} interface.
     * - The target must return the {IGRC1363Spender-onApprovalReceived} selector to accept the approval.
     */
    function checkOnGRC1363ApprovalReceived(
        address operator,
        address spender,
        uint256 value,
        bytes memory data
    ) internal {
        if (spender.code.length == 0) {
            revert GRC1363InvalidSpender(spender);
        }

        try IGRC1363Spender(spender).onApprovalReceived(operator, value, data) returns (bytes4 retval) {
            if (retval != IGRC1363Spender.onApprovalReceived.selector) {
                revert GRC1363InvalidSpender(spender);
            }
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert GRC1363InvalidSpender(spender);
            } else {
                assembly ("memory-safe") {
                    revert(add(reason, 0x20), mload(reason))
                }
            }
        }
    }
}
