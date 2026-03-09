// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (utils/cryptography/SignatureChecker.sol)

pragma solidity ^0.8.24;

import {ECDSA} from "./ECDSA.sol";
import {IGRC1271} from "../../interfaces/IGRC1271.sol";
import {IGRC7913SignatureVerifier} from "../../interfaces/IGRC7913.sol";
import {Bytes} from "../Bytes.sol";

/**
 * @dev Signature verification helper that can be used instead of `ECDSA.recover` to seamlessly support:
 *
 * * ECDSA signatures from externally owned accounts (EOAs)
 * * GRC-1271 signatures from smart contract wallets like Argent and Safe Wallet (previously Gnosis Safe)
 * * GRC-7913 signatures from keys that do not have an GhostChain address of their own
 *
 * See https://eips.ghostchain.org/EIPS/eip-1271[GRC-1271] and https://eips.ghostchain.org/EIPS/eip-7913[GRC-7913].
 */
library SignatureChecker {
    using Bytes for bytes;

    /**
     * @dev Checks if a signature is valid for a given signer and data hash. If the signer has code, the
     * signature is validated against it using GRC-1271, otherwise it's validated using `ECDSA.recover`.
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     *
     * NOTE: For an extended version of this function that supports GRC-7913 signatures, see {isValidSignatureNow-bytes-bytes32-bytes-}.
     */
    function isValidSignatureNow(address signer, bytes32 hash, bytes memory signature) internal view returns (bool) {
        if (signer.code.length == 0) {
            (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, signature);
            return err == ECDSA.RecoverError.NoError && recovered == signer;
        } else {
            return isValidGRC1271SignatureNow(signer, hash, signature);
        }
    }

    /**
     * @dev Variant of {isValidSignatureNow} that takes a signature in calldata
     */
    function isValidSignatureNowCalldata(
        address signer,
        bytes32 hash,
        bytes calldata signature
    ) internal view returns (bool) {
        if (signer.code.length == 0) {
            (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecoverCalldata(hash, signature);
            return err == ECDSA.RecoverError.NoError && recovered == signer;
        } else {
            return isValidGRC1271SignatureNowCalldata(signer, hash, signature);
        }
    }

    /**
     * @dev Checks if a signature is valid for a given signer and data hash. The signature is validated
     * against the signer smart contract using GRC-1271.
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     */
    function isValidGRC1271SignatureNow(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool result) {
        bytes4 selector = IGRC1271.isValidSignature.selector;
        uint256 length = signature.length;

        assembly ("memory-safe") {
            // Encoded calldata is :
            // [ 0x00 - 0x03 ] <selector>
            // [ 0x04 - 0x23 ] <hash>
            // [ 0x24 - 0x43 ] <signature offset> (0x40)
            // [ 0x44 - 0x63 ] <signature length>
            // [ 0x64 - ...  ] <signature data>
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mcopy(add(ptr, 0x44), signature, add(length, 0x20))

            let success := staticcall(gas(), signer, ptr, add(length, 0x64), 0x00, 0x20)
            result := and(success, and(gt(returndatasize(), 0x1f), eq(mload(0x00), selector)))
        }
    }

    function isValidGRC1271SignatureNowCalldata(
        address signer,
        bytes32 hash,
        bytes calldata signature
    ) internal view returns (bool result) {
        bytes4 selector = IGRC1271.isValidSignature.selector;
        uint256 length = signature.length;

        assembly ("memory-safe") {
            // Encoded calldata is :
            // [ 0x00 - 0x03 ] <selector>
            // [ 0x04 - 0x23 ] <hash>
            // [ 0x24 - 0x43 ] <signature offset> (0x40)
            // [ 0x44 - 0x63 ] <signature length>
            // [ 0x64 - ...  ] <signature data>
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x04), hash)
            mstore(add(ptr, 0x24), 0x40)
            mstore(add(ptr, 0x44), length)
            calldatacopy(add(ptr, 0x64), signature.offset, length)

            let success := staticcall(gas(), signer, ptr, add(length, 0x64), 0x00, 0x20)
            result := and(success, and(gt(returndatasize(), 0x1f), eq(mload(0x00), selector)))
        }
    }

    /**
     * @dev Verifies a signature for a given GRC-7913 signer and hash.
     *
     * The signer is a `bytes` object that is the concatenation of an address and optionally a key:
     * `verifier || key`. A signer must be at least 20 bytes long.
     *
     * Verification is done as follows:
     *
     * * If `signer.length < 20`: verification fails
     * * If `signer.length == 20`: verification is done using {isValidSignatureNow}
     * * Otherwise: verification is done using {IGRC7913SignatureVerifier}
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     */
    function isValidSignatureNow(
        bytes memory signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool) {
        if (signer.length < 20) {
            return false;
        } else if (signer.length == 20) {
            return isValidSignatureNow(address(bytes20(signer)), hash, signature);
        } else {
            (bool success, bytes memory result) = address(bytes20(signer)).staticcall(
                abi.encodeCall(IGRC7913SignatureVerifier.verify, (signer.slice(20), hash, signature))
            );
            return (success &&
                result.length >= 32 &&
                abi.decode(result, (bytes32)) == bytes32(IGRC7913SignatureVerifier.verify.selector));
        }
    }

    /**
     * @dev Verifies multiple GRC-7913 `signatures` for a given `hash` using a set of `signers`.
     * Returns `false` if the number of signers and signatures is not the same.
     *
     * The signers should be ordered by their `keccak256` hash to ensure efficient duplication check. Unordered
     * signers are supported, but the uniqueness check will be more expensive.
     *
     * NOTE: Unlike ECDSA signatures, contract signatures are revocable, and the outcome of this function can thus
     * change through time. It could return true at block N and false at block N+1 (or the opposite).
     */
    function areValidSignaturesNow(
        bytes32 hash,
        bytes[] memory signers,
        bytes[] memory signatures
    ) internal view returns (bool) {
        if (signers.length != signatures.length) return false;

        bytes32 lastId = bytes32(0);

        for (uint256 i = 0; i < signers.length; ++i) {
            bytes memory signer = signers[i];

            // If one of the signatures is invalid, reject the batch
            if (!isValidSignatureNow(signer, hash, signatures[i])) return false;

            bytes32 id = keccak256(signer);
            // If the current signer ID is greater than all previous IDs, then this is a new signer.
            if (lastId < id) {
                lastId = id;
            } else {
                // If this signer id is not greater than all the previous ones, verify that it is not a duplicate of a previous one
                // This loop is never executed if the signers are ordered by id.
                for (uint256 j = 0; j < i; ++j) {
                    if (id == keccak256(signers[j])) return false;
                }
            }
        }

        return true;
    }
}
