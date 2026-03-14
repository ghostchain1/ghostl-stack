// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/IGRC1271.sol)

pragma solidity >=0.5.0;

/**
 * @dev Interface of the GRC-1271 standard signature validation method for
 * contracts as defined in https://eips.ghostchain.org/EIPS/eip-1271[GRC-1271].
 */
interface IGRC1271 {
    /**
     * @dev Should return whether the signature provided is valid for the provided data
     * @param hash      Hash of the data to be signed
     * @param signature Signature byte array associated with `hash`
     */
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}
