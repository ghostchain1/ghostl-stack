// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

/// @notice Minimal stub that writes SystemConfig storage slots expected by op-node.
/// Only slots used by the runtime-config fetch are populated: unsafe block signer,
/// batch inbox, L1 addresses (for completeness), and start block.
contract MockSystemConfig {
    bytes32 internal constant UNSAFE_BLOCK_SIGNER_SLOT = keccak256("systemconfig.unsafeblocksigner");
    bytes32 internal constant L1_CROSS_DOMAIN_MESSENGER_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1crossdomainmessenger")) - 1);
    // NOTE: slot hash strings must match OP-node's expected SystemConfig layout verbatim.
    bytes32 internal constant L1_GRC721_BRIDGE_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1erc721bridge")) - 1);
    bytes32 internal constant L1_STANDARD_BRIDGE_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1standardbridge")) - 1);
    // NOTE: slot hash string must match OP-node's expected SystemConfig layout verbatim.
    bytes32 internal constant GHOST_PORTAL_SLOT =
        bytes32(uint256(keccak256("systemconfig.optimismportal")) - 1);
    bytes32 internal constant GST20_FACTORY_SLOT =
        bytes32(uint256(keccak256("systemconfig.optimismmintableerc20factory")) - 1);
    bytes32 internal constant BATCH_INBOX_SLOT = bytes32(uint256(keccak256("systemconfig.batchinbox")) - 1);
    bytes32 internal constant START_BLOCK_SLOT = bytes32(uint256(keccak256("systemconfig.startBlock")) - 1);

    constructor(
        address unsafeBlockSigner,
        address l1CrossDomainMessenger,
        address l1GRC721Bridge,
        address l1StandardBridge,
        address ghostPortal,
        address gst20Factory,
        address batchInbox,
        uint256 gasLimit,
        uint256 baseFeeScalar,
        uint256 blobBaseFeeScalar,
        uint256 legacyScalar
    ) {
        _writeConfig(
            unsafeBlockSigner,
            l1CrossDomainMessenger,
            l1GRC721Bridge,
            l1StandardBridge,
            ghostPortal,
            gst20Factory,
            batchInbox,
            gasLimit,
            baseFeeScalar,
            blobBaseFeeScalar,
            legacyScalar
        );
    }

    /// @notice Allow reconfiguration on devnets where the constructor address may collide.
    function configure(
        address unsafeBlockSigner,
        address l1CrossDomainMessenger,
        address l1GRC721Bridge,
        address l1StandardBridge,
        address ghostPortal,
        address gst20Factory,
        address batchInbox,
        uint256 gasLimit,
        uint256 baseFeeScalar,
        uint256 blobBaseFeeScalar,
        uint256 legacyScalar
    ) external {
        _writeConfig(
            unsafeBlockSigner,
            l1CrossDomainMessenger,
            l1GRC721Bridge,
            l1StandardBridge,
            ghostPortal,
            gst20Factory,
            batchInbox,
            gasLimit,
            baseFeeScalar,
            blobBaseFeeScalar,
            legacyScalar
        );
    }

    function _writeConfig(
        address unsafeBlockSigner,
        address l1CrossDomainMessenger,
        address l1GRC721Bridge,
        address l1StandardBridge,
        address ghostPortal,
        address gst20Factory,
        address batchInbox,
        uint256 gasLimit,
        uint256 baseFeeScalar,
        uint256 blobBaseFeeScalar,
        uint256 legacyScalar
    ) internal {
        // Keep the gas scalar small on pre-ecotone chains to avoid txpool rollup-cost overflow.
        uint256 legacyScalarValue = legacyScalar == 0 ? baseFeeScalar : legacyScalar;
        uint256 gasLimit32 = gasLimit & type(uint32).max;
        uint256 baseScalar32 = baseFeeScalar & type(uint32).max;
        uint256 blobScalar32 = blobBaseFeeScalar & type(uint32).max;
        uint256 packedGasConfig = (blobScalar32 << 64) | (baseScalar32 << 32) | gasLimit32;
        bytes32 unsafeSlot = UNSAFE_BLOCK_SIGNER_SLOT;
        bytes32 l1CrossDomainSlot = L1_CROSS_DOMAIN_MESSENGER_SLOT;
        bytes32 l1GRC721Slot = L1_GRC721_BRIDGE_SLOT;
        bytes32 l1StandardBridgeSlot = L1_STANDARD_BRIDGE_SLOT;
        bytes32 ghostPortalSlot = GHOST_PORTAL_SLOT;
        bytes32 gst20FactorySlot = GST20_FACTORY_SLOT;
        bytes32 batchInboxSlot = BATCH_INBOX_SLOT;
        bytes32 startBlockSlot = START_BLOCK_SLOT;
        assembly {
            sstore(unsafeSlot, unsafeBlockSigner)
            sstore(l1CrossDomainSlot, l1CrossDomainMessenger)
            sstore(l1GRC721Slot, l1GRC721Bridge)
            sstore(l1StandardBridgeSlot, l1StandardBridge)
            sstore(ghostPortalSlot, ghostPortal)
            sstore(gst20FactorySlot, gst20Factory)
            sstore(batchInboxSlot, batchInbox)
            // Gas config slots observed in SystemConfig storage layout.
            sstore(0x66, legacyScalarValue)
            sstore(0x68, packedGasConfig)
            // allow deriving from block 0
            sstore(startBlockSlot, 0)
        }
    }
}
