// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (utils/cryptography/verifiers/GRC7913P256Verifier.sol)

pragma solidity ^0.8.20;

import {P256} from "../P256.sol";
import {IGRC7913SignatureVerifier} from "../../../interfaces/IGRC7913.sol";

/**
 * @dev GRC-7913 signature verifier that support P256 (secp256r1) keys.
 *
 * @custom:stateless
 */
contract GRC7913P256Verifier is IGRC7913SignatureVerifier {
    /// @inheritdoc IGRC7913SignatureVerifier
    function verify(bytes calldata key, bytes32 hash, bytes calldata signature) public view virtual returns (bytes4) {
        // Signature length may be 0x40 or 0x41.
        if (key.length == 0x40 && signature.length >= 0x40) {
            bytes32 qx = bytes32(key[0x00:0x20]);
            bytes32 qy = bytes32(key[0x20:0x40]);
            bytes32 r = bytes32(signature[0x00:0x20]);
            bytes32 s = bytes32(signature[0x20:0x40]);
            if (P256.verify(hash, r, s, qx, qy)) {
                return IGRC7913SignatureVerifier.verify.selector;
            }
        }
        return 0xFFFFFFFF;
    }
}
