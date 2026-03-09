// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (utils/introspection/GST165Checker.sol)

pragma solidity ^0.8.20;

import {IGST165} from "./IGST165.sol";

/**
 * @dev Library used to query support of an interface declared via {IGST165}.
 *
 * Note that these functions return the actual result of the query: they do not
 * `revert` if an interface is not supported. It is up to the caller to decide
 * what to do in these cases.
 */
library GST165Checker {
    // As per the GST-165 spec, no interface should ever match 0xffffffff
    bytes4 private constant INTERFACE_ID_INVALID = 0xffffffff;

    /**
     * @dev Returns true if `account` supports the {IGST165} interface.
     */
    function supportsGST165(address account) internal view returns (bool) {
        // Any contract that implements GST-165 must explicitly indicate support of
        // InterfaceId_GST165 and explicitly indicate non-support of InterfaceId_Invalid
        if (supportsGST165InterfaceUnchecked(account, type(IGST165).interfaceId)) {
            (bool success, bool supported) = _trySupportsInterface(account, INTERFACE_ID_INVALID);
            return success && !supported;
        } else {
            return false;
        }
    }

    /**
     * @dev Returns true if `account` supports the interface defined by
     * `interfaceId`. Support for {IGST165} itself is queried automatically.
     *
     * See {IGST165-supportsInterface}.
     */
    function supportsInterface(address account, bytes4 interfaceId) internal view returns (bool) {
        // query support of both GST-165 as per the spec and support of _interfaceId
        return supportsGST165(account) && supportsGST165InterfaceUnchecked(account, interfaceId);
    }

    /**
     * @dev Returns a boolean array where each value corresponds to the
     * interfaces passed in and whether they're supported or not. This allows
     * you to batch check interfaces for a contract where your expectation
     * is that some interfaces may not be supported.
     *
     * See {IGST165-supportsInterface}.
     */
    function getSupportedInterfaces(
        address account,
        bytes4[] memory interfaceIds
    ) internal view returns (bool[] memory) {
        // an array of booleans corresponding to interfaceIds and whether they're supported or not
        bool[] memory interfaceIdsSupported = new bool[](interfaceIds.length);

        // query support of GST-165 itself
        if (supportsGST165(account)) {
            // query support of each interface in interfaceIds
            for (uint256 i = 0; i < interfaceIds.length; i++) {
                interfaceIdsSupported[i] = supportsGST165InterfaceUnchecked(account, interfaceIds[i]);
            }
        }

        return interfaceIdsSupported;
    }

    /**
     * @dev Returns true if `account` supports all the interfaces defined in
     * `interfaceIds`. Support for {IGST165} itself is queried automatically.
     *
     * Batch-querying can lead to gas savings by skipping repeated checks for
     * {IGST165} support.
     *
     * See {IGST165-supportsInterface}.
     */
    function supportsAllInterfaces(address account, bytes4[] memory interfaceIds) internal view returns (bool) {
        // query support of GST-165 itself
        if (!supportsGST165(account)) {
            return false;
        }

        // query support of each interface in interfaceIds
        for (uint256 i = 0; i < interfaceIds.length; i++) {
            if (!supportsGST165InterfaceUnchecked(account, interfaceIds[i])) {
                return false;
            }
        }

        // all interfaces supported
        return true;
    }

    /**
     * @notice Query if a contract implements an interface, does not check GST-165 support
     * @param account The address of the contract to query for support of an interface
     * @param interfaceId The interface identifier, as specified in GST-165
     * @return true if the contract at account indicates support of the interface with
     * identifier interfaceId, false otherwise
     * @dev Assumes that account contains a contract that supports GST-165, otherwise
     * the behavior of this method is undefined. This precondition can be checked
     * with {supportsGST165}.
     *
     * Some precompiled contracts will falsely indicate support for a given interface, so caution
     * should be exercised when using this function.
     *
     * Interface identification is specified in GST-165.
     */
    function supportsGST165InterfaceUnchecked(address account, bytes4 interfaceId) internal view returns (bool) {
        (bool success, bool supported) = _trySupportsInterface(account, interfaceId);
        return success && supported;
    }

    /**
     * @dev Attempts to call `supportsInterface` on a contract and returns both the call
     * success status and the interface support result.
     *
     * This function performs a low-level static call to the contract's `supportsInterface`
     * function. It returns:
     *
     * * `success`: true if the call didn't revert, false if it did
     * * `supported`: true if the returned data indicating the interface is supported
     */
    function _trySupportsInterface(
        address account,
        bytes4 interfaceId
    ) private view returns (bool success, bool supported) {
        bytes4 selector = IGST165.supportsInterface.selector;

        assembly ("memory-safe") {
            mstore(0x00, selector)
            mstore(0x04, interfaceId)
            success := staticcall(30000, account, 0x00, 0x24, 0x00, 0x20)
            supported := and(
                gt(returndatasize(), 0x1F), // we have at least 32 bytes of returndata
                iszero(iszero(mload(0x00))) // the first 32 bytes of returndata are non-zero
            )
        }
    }
}
