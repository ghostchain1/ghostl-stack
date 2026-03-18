// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghost/GhostECDSA.sol)
pragma solidity ^0.8.24;

/**
 * @title  GhostECDSA
 * @notice ECDSA signature utilities for GhostChain.
 *
 *         Ghost-branded replacement for OpenZeppelin's ECDSA + MessageHashUtils.
 *         Designed for `using GhostECDSA for bytes32;` so call sites are
 *         identical to the OZ pattern:
 *
 *             using GhostECDSA for bytes32;
 *             address signer = hash.toEthSignedMessageHash().recover(sig);
 *             address signer = hash.toGhostSignedMessageHash().recover(sig);
 *
 * Security notes
 * --------------
 * - Invalid or malleable (high-s) signatures revert rather than returning
 *   address(0) to avoid silent authentication bypass.
 * - Signature malleability is NOT guarded — callers must track nonces or
 *   message hashes to prevent replay attacks.
 */
library GhostECDSA {
    // ─── Errors ────────────────────────────────────────────────────────────────

    error GhostECDSA__InvalidSignatureLength(uint256 length);
    error GhostECDSA__InvalidSignature();

    // ─── Recover ───────────────────────────────────────────────────────────────

    /**
     * @notice Recover the signer address from a 65-byte `{r,s,v}` signature.
     * @param  hash  The 32-byte message hash that was signed.
     * @param  sig   65-byte signature encoded as `abi.encodePacked(r, s, v)`.
     * @return signer  The recovered signer address.
     *
     * Reverts with `GhostECDSA__InvalidSignatureLength` for wrong lengths and
     * `GhostECDSA__InvalidSignature` if ecrecover returns address(0).
     */
    function recover(bytes32 hash, bytes memory sig) internal pure returns (address signer) {
        if (sig.length != 65) revert GhostECDSA__InvalidSignatureLength(sig.length);

        bytes32 r;
        bytes32 s;
        uint8 v;

        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }

        signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) revert GhostECDSA__InvalidSignature();
    }

    // ─── Message hash helpers ──────────────────────────────────────────────────

    /**
     * @notice Apply the legacy personal-sign prefix so the result matches
     *         what `eth_sign` / `personal_sign` produces in compatibility wallets.
     * @dev    `\x19Ethereum Signed Message:\n32` — 32 == sizeof(bytes32).
     *         Use this when signing with legacy EVM-compatible tooling.
     */
    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        // abi.encodePacked costs 3 memory allocations; inline assembly is 1 op cheaper
        // and avoids the scratch-space penalty on tight loops.
        bytes32 prefixed;
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            // Store prefix in scratch space (0x00..0x3f) — safe per ABI spec
            // "\x19Ethereum Signed Message:\n32" = 0x19 + 25-byte ASCII + 0x32
            mstore(0x00, "\x19Ethereum Signed Message:\n32")
            mstore(0x1c, hash)
            prefixed := keccak256(0x00, 0x3c)
        }
        return prefixed;
    }

    /**
     * @notice Apply the GhostChain native-sign prefix.
     *         Use this when signing with GhostWallet or GhostBrain internal tooling.
     * @dev    `\x19GhostChain Signed Message:\n32`
     */
    function toGhostSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19GhostChain Signed Message:\n32", hash));
    }
}
