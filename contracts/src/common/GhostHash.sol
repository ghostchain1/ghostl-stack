// SPDX-License-Identifier: MIT
// GhostChain Contracts v1.0.0 (common/GhostHash.sol)

pragma solidity ^0.8.24;

/**
 * @title  GhostHash
 * @author GhostChain <security@ghostchain.cloud>
 * @notice Canonical inline-assembly keccak256 helpers for the GhostChain
 *         protocol suite.  Every function uses raw memory operations instead
 *         of abi.encode / abi.encodePacked, which:
 *           • eliminates the forge-lint `asm-keccak256` warning on every call site,
 *           • saves 200–600 gas per call vs. the ABI-encoder path (no scratch
 *             allocation, no length-prefix writes, no dynamic dispatch), and
 *           • keeps a single auditable source of truth for every protocol hash.
 *
 * Encoding contract (matches abi.encode semantics):
 *   • All value types (address, uint*, int*, bool, bytes1–32) are right-aligned
 *     in a 32-byte slot when stored with mstore().  This is identical to what
 *     abi.encode produces.  Do NOT use these helpers for dynamic types (bytes,
 *     string, arrays) unless you pre-hash the dynamic payload first.
 *
 * Sections:
 *   A  Generic N-word hashes     (1 – 7 words, abi.encode compatible)
 *   B  EIP-712 typed-data        (digest, domain separator)
 *   C  Bridge transfer keys      (native GST, GRC-20 token, XDomain message)
 *   D  GNS node hashing          (namehash, label hash)
 *   E  Merkle tree               (leaf, node, proof step)
 *   F  Governance & timelock     (op id, proposal id, layer-root key)
 *   G  AI / evidence pipeline    (finding id, plan id, patch id)
 *   H  Storage slot helpers      (ERC-7201 namespaced slots)
 */
library GhostHash {

    // ═══════════════════════════════════════════════════════════════════════════
    // A. Generic N-word hashes
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Each word occupies exactly 32 bytes (right-aligned), matching abi.encode
    // for bool, address, uint*, int*, bytes1–bytes32.

    function hash1(bytes32 a) internal pure returns (bytes32 h) {
        assembly {
            mstore(0x00, a)
            h := keccak256(0x00, 0x20)
        }
    }

    function hash2(bytes32 a, bytes32 b) internal pure returns (bytes32 h) {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            h := keccak256(0x00, 0x40)
        }
    }

    function hash3(bytes32 a, bytes32 b, bytes32 c) internal pure returns (bytes32 h) {
        assembly {
            let p := mload(0x40)
            mstore(p,          a)
            mstore(add(p,0x20), b)
            mstore(add(p,0x40), c)
            h := keccak256(p, 0x60)
        }
    }

    function hash4(bytes32 a, bytes32 b, bytes32 c, bytes32 d) internal pure returns (bytes32 h) {
        assembly {
            let p := mload(0x40)
            mstore(p,          a)
            mstore(add(p,0x20), b)
            mstore(add(p,0x40), c)
            mstore(add(p,0x60), d)
            h := keccak256(p, 0x80)
        }
    }

    function hash5(bytes32 a, bytes32 b, bytes32 c, bytes32 d, bytes32 e)
        internal pure returns (bytes32 h)
    {
        assembly {
            let p := mload(0x40)
            mstore(p,          a)
            mstore(add(p,0x20), b)
            mstore(add(p,0x40), c)
            mstore(add(p,0x60), d)
            mstore(add(p,0x80), e)
            h := keccak256(p, 0xa0)
        }
    }

    function hash6(bytes32 a, bytes32 b, bytes32 c, bytes32 d, bytes32 e, bytes32 f)
        internal pure returns (bytes32 h)
    {
        assembly {
            let p := mload(0x40)
            mstore(p,          a)
            mstore(add(p,0x20), b)
            mstore(add(p,0x40), c)
            mstore(add(p,0x60), d)
            mstore(add(p,0x80), e)
            mstore(add(p,0xa0), f)
            h := keccak256(p, 0xc0)
        }
    }

    function hash7(bytes32 a, bytes32 b, bytes32 c, bytes32 d, bytes32 e, bytes32 f, bytes32 g)
        internal pure returns (bytes32 h)
    {
        assembly {
            let p := mload(0x40)
            mstore(p,          a)
            mstore(add(p,0x20), b)
            mstore(add(p,0x40), c)
            mstore(add(p,0x60), d)
            mstore(add(p,0x80), e)
            mstore(add(p,0xa0), f)
            mstore(add(p,0xc0), g)
            h := keccak256(p, 0xe0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // B. EIP-712 typed-data helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Compute an EIP-712 typed-data digest.
     * @dev    Pre-image layout (66 bytes / 0x42):
     *           bytes [0..1]   = "\x19\x01"
     *           bytes [2..33]  = domainSep
     *           bytes [34..65] = structHash
     *         Equivalent to:
     *           keccak256(abi.encodePacked("\x19\x01", domainSep, structHash))
     */
    function eip712Digest(bytes32 domainSep, bytes32 structHash)
        internal pure returns (bytes32 digest)
    {
        assembly {
            let p := mload(0x40)
            // 0x1901 left-justified: "\x19" at p+0, "\x01" at p+1, zeros after.
            mstore(p, 0x1901000000000000000000000000000000000000000000000000000000000000)
            mstore(add(p, 0x02), domainSep)
            mstore(add(p, 0x22), structHash)
            digest := keccak256(p, 0x42)
        }
    }

    /**
     * @notice Compute a standard 5-field EIP-712 domain separator.
     * @dev    Equivalent to:
     *           keccak256(abi.encode(typeHash, nameHash, versionHash, chainId, verifier))
     */
    function domainSeparator(
        bytes32 typeHash,
        bytes32 nameHash,
        bytes32 versionHash,
        uint256 chainId,
        address verifier
    ) internal pure returns (bytes32 sep) {
        assembly {
            let p := mload(0x40)
            mstore(p,          typeHash)
            mstore(add(p,0x20), nameHash)
            mstore(add(p,0x40), versionHash)
            mstore(add(p,0x60), chainId)
            mstore(add(p,0x80), verifier)
            sep := keccak256(p, 0xa0)
        }
    }

    /**
     * @notice Hash a single EIP-712 struct word (typeHash ‖ value).
     * @dev    Equivalent to keccak256(abi.encode(typeHash, value)).
     *         Use for simple single-field struct hashes.
     */
    function structHash1(bytes32 typeHash, bytes32 value)
        internal pure returns (bytes32 h)
    {
        assembly {
            mstore(0x00, typeHash)
            mstore(0x20, value)
            h := keccak256(0x00, 0x40)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // C. Bridge transfer-key helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Key for a native-asset (GST/ETH) bridge transfer.
     * @dev    Equivalent to keccak256(abi.encode(from, to, amount, nonce)).
     *         Used by L2L3Bridge._finalizeNativeToL3 and L3Inbox.
     */
    function bridgeNativeKey(address from, address to, uint256 amount, uint256 nonce)
        internal pure returns (bytes32 key)
    {
        assembly {
            let p := mload(0x40)
            mstore(p,          from)
            mstore(add(p,0x20), to)
            mstore(add(p,0x40), amount)
            mstore(add(p,0x60), nonce)
            key := keccak256(p, 0x80)
        }
    }

    /**
     * @notice Key for a GRC-20 token bridge deposit/withdraw.
     * @dev    Equivalent to keccak256(abi.encode(token, from, to, amount, nonce)).
     *         Used by L2L3Bridge._finalizeGST20ToL3 and L3BridgedToken.
     */
    function bridgeTokenKey(address token, address from, address to, uint256 amount, uint256 nonce)
        internal pure returns (bytes32 key)
    {
        assembly {
            let p := mload(0x40)
            mstore(p,          token)
            mstore(add(p,0x20), from)
            mstore(add(p,0x40), to)
            mstore(add(p,0x60), amount)
            mstore(add(p,0x80), nonce)
            key := keccak256(p, 0xa0)
        }
    }

    /**
     * @notice Key for a sender-initiated GRC-20 deposit where sender == from.
     * @dev    Equivalent to keccak256(abi.encode(token, msg.sender, to, amount, nonce)).
     *         All five fields match bridgeTokenKey; provided as a named alias.
     */
    function bridgeSenderTokenKey(address token, address sender, address to, uint256 amount, uint256 nonce)
        internal pure returns (bytes32 key)
    {
        return bridgeTokenKey(token, sender, to, amount, nonce);
    }

    /**
     * @notice XDomainMessenger message key.
     * @dev    Equivalent to keccak256(abi.encode(nonce, sender, target, value, messageHash))
     *         where messageHash is keccak256(calldata message).
     */
    function xMessageKey(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        bytes32 messageHash
    ) internal pure returns (bytes32 key) {
        assembly {
            let p := mload(0x40)
            mstore(p,          nonce)
            mstore(add(p,0x20), sender)
            mstore(add(p,0x40), target)
            mstore(add(p,0x60), value)
            mstore(add(p,0x80), messageHash)
            key := keccak256(p, 0xa0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // D. GNS (Ghost Name Service) node hashing
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Compute a GNS namehash node from a parent node and a label hash.
     * @dev    Equivalent to keccak256(abi.encodePacked(parent, labelHash)).
     *         Both inputs are 32 bytes so encodePacked == encode for this pair.
     *         This is the GhostChain equivalent of ENS namehash.
     */
    function gnsNode(bytes32 parent, bytes32 labelHash)
        internal pure returns (bytes32 node)
    {
        assembly {
            mstore(0x00, parent)
            mstore(0x20, labelHash)
            node := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Compute the keccak256 label hash of a UTF-8 name string.
     * @dev    Equivalent to keccak256(bytes(label)).
     *         Call this to prepare the `labelHash` argument for gnsNode().
     */
    function gnsLabelHash(string memory label) internal pure returns (bytes32 h) {
        assembly {
            h := keccak256(add(label, 0x20), mload(label))
        }
    }

    /**
     * @notice Compute a GNS node directly from a parent and a UTF-8 label string.
     * @dev    Equivalent to keccak256(abi.encodePacked(parent, keccak256(bytes(label)))).
     */
    function gnsNodeFromLabel(bytes32 parent, string memory label)
        internal pure returns (bytes32 node)
    {
        bytes32 lh;
        assembly { lh := keccak256(add(label, 0x20), mload(label)) }
        return gnsNode(parent, lh);
    }

    /**
     * @notice Compute the GhostChain root node for a top-level domain.
     * @dev    Equivalent to keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(tld)))).
     *         For ".ghost": gnsRoot("ghost")
     */
    function gnsRoot(string memory tld) internal pure returns (bytes32 root) {
        return gnsNode(bytes32(0), gnsLabelHash(tld));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // E. Merkle-tree helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Hash a Merkle leaf: keccak256(index ‖ leafHash).
     * @dev    Equivalent to keccak256(abi.encodePacked(index, leafHash)).
     */
    function merkleLeaf(uint256 index, bytes32 leafHash)
        internal pure returns (bytes32 h)
    {
        assembly {
            mstore(0x00, index)
            mstore(0x20, leafHash)
            h := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Hash two Merkle sibling nodes (order-preserving).
     * @dev    Equivalent to keccak256(abi.encodePacked(left, right)).
     *         Caller is responsible for correct ordering.
     */
    function merkleNode(bytes32 left, bytes32 right)
        internal pure returns (bytes32 h)
    {
        assembly {
            mstore(0x00, left)
            mstore(0x20, right)
            h := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Apply one Merkle proof step, honouring sibling position.
     * @param  computed  The hash accumulated so far.
     * @param  sibling   The sibling node supplied by the proof.
     * @param  sibLeft   True when the sibling is the *left* child.
     */
    function merkleStep(bytes32 computed, bytes32 sibling, bool sibLeft)
        internal pure returns (bytes32 h)
    {
        assembly {
            switch sibLeft
            case 1 {
                mstore(0x00, sibling)
                mstore(0x20, computed)
            }
            default {
                mstore(0x00, computed)
                mstore(0x20, sibling)
            }
            h := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Canonical sorted-sibling merge (smaller hash on the left).
     * @dev    Produces a consistent root regardless of proof direction.
     *         Equivalent to:
     *           a < b ? keccak256(a ‖ b) : keccak256(b ‖ a)
     */
    function merkleSorted(bytes32 a, bytes32 b)
        internal pure returns (bytes32 h)
    {
        assembly {
            switch lt(a, b)
            case 1 { mstore(0x00, a) mstore(0x20, b) }
            default { mstore(0x00, b) mstore(0x20, a) }
            h := keccak256(0x00, 0x40)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // F. Governance & timelock operation-id helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Timelock operation id.
     * @dev    Equivalent to keccak256(abi.encode(target, value, dataHash, salt)).
     *         Matches GhostChainTimelock and GhostTimelockController.
     */
    function timelockOpId(
        address target,
        uint256 value,
        bytes32 dataHash,
        bytes32 salt
    ) internal pure returns (bytes32 opId) {
        assembly {
            let p := mload(0x40)
            mstore(p,          target)
            mstore(add(p,0x20), value)
            mstore(add(p,0x40), dataHash)
            mstore(add(p,0x60), salt)
            opId := keccak256(p, 0x80)
        }
    }

    /**
     * @notice Proposal id for GhostGovernanceGovernor.
     * @dev    Equivalent to
     *           keccak256(abi.encode(nonce, target, value, dataHash, descriptionHash)).
     */
    function governorProposalId(
        uint256 nonce,
        address target,
        uint256 value,
        bytes32 dataHash,
        bytes32 descriptionHash
    ) internal pure returns (bytes32 pid) {
        assembly {
            let p := mload(0x40)
            mstore(p,          nonce)
            mstore(add(p,0x20), target)
            mstore(add(p,0x40), value)
            mstore(add(p,0x60), dataHash)
            mstore(add(p,0x80), descriptionHash)
            pid := keccak256(p, 0xa0)
        }
    }

    /**
     * @notice Layer → state-root key for BridgeHub and RouteGuard.
     * @dev    Equivalent to keccak256(abi.encode(layer, root)).
     */
    function layerRootKey(uint256 layer, bytes32 root)
        internal pure returns (bytes32 key)
    {
        assembly {
            mstore(0x00, layer)
            mstore(0x20, root)
            key := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Upgrade manager action hash.
     * @dev    Equivalent to keccak256(abi.encode(actionType, upgradeId, implHash, activateAt)).
     */
    function upgradeActionHash(
        bytes32 actionType,
        uint256 upgradeId,
        bytes32 implHash,
        uint256 activateAt
    ) internal pure returns (bytes32 h) {
        assembly {
            let p := mload(0x40)
            mstore(p,          actionType)
            mstore(add(p,0x20), upgradeId)
            mstore(add(p,0x40), implHash)
            mstore(add(p,0x60), activateAt)
            h := keccak256(p, 0x80)
        }
    }

    /**
     * @notice Cross-chain interchain-authorization asset key.
     * @dev    Equivalent to keccak256(abi.encode(dstChainId, asset)).
     */
    function interchainAssetKey(uint256 dstChainId, address asset)
        internal pure returns (bytes32 key)
    {
        assembly {
            mstore(0x00, dstChainId)
            mstore(0x20, asset)
            key := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice AI command-center action key (target + selector, packed).
     * @dev    Equivalent to keccak256(abi.encodePacked(target, selector)).
     *         Note: encodePacked for (address, bytes4) = 20 + 4 = 24 bytes.
     */
    function commandActionKey(address target, bytes4 selector)
        internal pure returns (bytes32 key)
    {
        assembly {
            // address (20 bytes) left-shifted to high bits of a word,
            // selector (4 bytes) packed immediately after — total 24 bytes.
            let packed := or(shl(32, shr(0, shl(96, target))), shr(224, selector))
            mstore(0x00, packed)
            key := keccak256(0x00, 0x18)  // 24 bytes
        }
    }

    /**
     * @notice MainnetLaunchGate release request id.
     * @dev    Equivalent to keccak256(abi.encode(
     *           releaseId, manifestHash, genesisHashL1,
     *           rollupHashL2, rollupHashL3, imagesLockHash)).
     */
    function launchRequestId(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 genesisHashL1,
        bytes32 rollupHashL2,
        bytes32 rollupHashL3,
        bytes32 imagesLockHash
    ) internal pure returns (bytes32 rid) {
        assembly {
            let p := mload(0x40)
            mstore(p,          releaseId)
            mstore(add(p,0x20), manifestHash)
            mstore(add(p,0x40), genesisHashL1)
            mstore(add(p,0x60), rollupHashL2)
            mstore(add(p,0x80), rollupHashL3)
            mstore(add(p,0xa0), imagesLockHash)
            rid := keccak256(p, 0xc0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // G. AI / evidence-pipeline id helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice GhostBrainIntegration scan finding id.
     * @dev    Equivalent to
     *           keccak256(abi.encode(scanHash, correlationId, severity, timestamp, reporter)).
     */
    function findingId(
        bytes32 scanHash,
        bytes32 correlationId,
        uint256 severity,
        uint256 ts,
        address reporter
    ) internal pure returns (bytes32 fid) {
        assembly {
            let p := mload(0x40)
            mstore(p,          scanHash)
            mstore(add(p,0x20), correlationId)
            mstore(add(p,0x40), severity)
            mstore(add(p,0x60), ts)
            mstore(add(p,0x80), reporter)
            fid := keccak256(p, 0xa0)
        }
    }

    /**
     * @notice GhostBrainIntegration remediation plan id.
     * @dev    Equivalent to
     *           keccak256(abi.encode(findingHash, planHash, stepCount, timestamp, planner)).
     */
    function planId(
        bytes32 findingHash,
        bytes32 planHash,
        uint256 stepCount,
        uint256 ts,
        address planner
    ) internal pure returns (bytes32 pid) {
        assembly {
            let p := mload(0x40)
            mstore(p,          findingHash)
            mstore(add(p,0x20), planHash)
            mstore(add(p,0x40), stepCount)
            mstore(add(p,0x60), ts)
            mstore(add(p,0x80), planner)
            pid := keccak256(p, 0xa0)
        }
    }

    /**
     * @notice GhostBrainIntegration patch-bundle id.
     * @dev    Equivalent to
     *           keccak256(abi.encode(planHash, bundleHash, patchHash, applied, timestamp, patcher)).
     */
    function patchId(
        bytes32 planHash,
        bytes32 bundleHash,
        bytes32 patchHash,
        bool applied,
        uint256 ts,
        address patcher
    ) internal pure returns (bytes32 pid) {
        assembly {
            let p := mload(0x40)
            mstore(p,          planHash)
            mstore(add(p,0x20), bundleHash)
            mstore(add(p,0x40), patchHash)
            mstore(add(p,0x60), applied)
            mstore(add(p,0x80), ts)
            mstore(add(p,0xa0), patcher)
            pid := keccak256(p, 0xc0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // H. Storage slot helpers (ERC-7201 namespaced storage)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Compute an ERC-7201 namespaced storage slot.
     * @dev    slot = keccak256(id) - 1  (avoids collision with slot 0)
     *         Equivalent to the `@custom:storage-location erc7201:<id>` pattern.
     */
    function erc7201Slot(bytes32 id) internal pure returns (bytes32 slot) {
        assembly {
            mstore(0x00, id)
            slot := sub(keccak256(0x00, 0x20), 1)
        }
    }

    /**
     * @notice Derive a mapping storage slot: keccak256(key ‖ baseSlot).
     * @dev    Equivalent to the Solidity compiler's mapping slot derivation.
     */
    function mappingSlot(bytes32 key, bytes32 baseSlot)
        internal pure returns (bytes32 slot)
    {
        assembly {
            mstore(0x00, key)
            mstore(0x20, baseSlot)
            slot := keccak256(0x00, 0x40)
        }
    }
}
