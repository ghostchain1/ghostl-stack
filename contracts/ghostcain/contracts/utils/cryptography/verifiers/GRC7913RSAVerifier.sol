// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (utils/cryptography/verifiers/GRC7913RSAVerifier.sol)

pragma solidity ^0.8.20;

import {RSA} from "../RSA.sol";
import {IGRC7913SignatureVerifier} from "../../../interfaces/IGRC7913.sol";

/**
 * @dev GRC-7913 signature verifier that support RSA keys.
 *
 * @custom:stateless
 */
contract GRC7913RSAVerifier is IGRC7913SignatureVerifier {
    /// @inheritdoc IGRC7913SignatureVerifier
    function verify(bytes calldata key, bytes32 hash, bytes calldata signature) public view virtual returns (bytes4) {
        (bytes memory e, bytes memory n) = abi.decode(key, (bytes, bytes));
        return
            RSA.pkcs1Sha256(abi.encodePacked(hash), signature, e, n)
                ? IGRC7913SignatureVerifier.verify.selector
                : bytes4(0xFFFFFFFF);
    }
}
