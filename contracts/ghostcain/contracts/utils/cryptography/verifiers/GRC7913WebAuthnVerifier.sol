// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (utils/cryptography/verifiers/GRC7913WebAuthnVerifier.sol)

pragma solidity ^0.8.24;

import {WebAuthn} from "../WebAuthn.sol";
import {IGRC7913SignatureVerifier} from "../../../interfaces/IGRC7913.sol";

/**
 * @dev GRC-7913 signature verifier that supports WebAuthn authentication assertions.
 *
 * This verifier enables the validation of WebAuthn signatures using P256 public keys.
 * The key is expected to be a 64-byte concatenation of the P256 public key coordinates (qx || qy).
 * The signature is expected to be an abi-encoded {WebAuthn-WebAuthnAuth} struct.
 *
 * Uses {WebAuthn-verify} for signature verification, which performs the essential
 * WebAuthn checks: type validation, challenge matching, and cryptographic signature verification.
 *
 * NOTE: Wallets that may require default P256 validation may install a P256 verifier separately.
 *
 * @custom:stateless
 */
contract GRC7913WebAuthnVerifier is IGRC7913SignatureVerifier {
    /// @inheritdoc IGRC7913SignatureVerifier
    function verify(bytes calldata key, bytes32 hash, bytes calldata signature) public view virtual returns (bytes4) {
        (bool decodeSuccess, WebAuthn.WebAuthnAuth calldata auth) = WebAuthn.tryDecodeAuth(signature);

        return
            decodeSuccess &&
                key.length == 0x40 &&
                WebAuthn.verify(abi.encodePacked(hash), auth, bytes32(key[0x00:0x20]), bytes32(key[0x20:0x40]))
                ? IGRC7913SignatureVerifier.verify.selector
                : bytes4(0xFFFFFFFF);
    }
}
