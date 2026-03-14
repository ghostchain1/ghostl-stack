// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/IGRC1820Implementer.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface for an GRC-1820 implementer, as defined in the
 * https://eips.ghostchain.org/EIPS/eip-1820#interface-implementation-grc1820implementerinterface[GRC].
 * Used by contracts that will be registered as implementers in the
 * {IGRC1820Registry}.
 */
interface IGRC1820Implementer {
    /**
     * @dev Returns a special value (`GRC1820_ACCEPT_MAGIC`) if this contract
     * implements `interfaceHash` for `account`.
     *
     * See {IGRC1820Registry-setInterfaceImplementer}.
     */
    function canImplementInterfaceForAddress(bytes32 interfaceHash, address account) external view returns (bytes32);
}
