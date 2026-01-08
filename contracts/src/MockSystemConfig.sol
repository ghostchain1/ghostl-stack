// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal stub that writes SystemConfig storage slots expected by op-node.
/// Only slots used by the runtime-config fetch are populated: unsafe block signer,
/// batch inbox, L1 addresses (for completeness), and start block.
contract MockSystemConfig {
    bytes32 internal constant UNSAFE_BLOCK_SIGNER_SLOT = keccak256("systemconfig.unsafeblocksigner");
    bytes32 internal constant L1_CROSS_DOMAIN_MESSENGER_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1crossdomainmessenger")) - 1);
    bytes32 internal constant L1_ERC_721_BRIDGE_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1erc721bridge")) - 1);
    bytes32 internal constant L1_STANDARD_BRIDGE_SLOT =
        bytes32(uint256(keccak256("systemconfig.l1standardbridge")) - 1);
    bytes32 internal constant OPTIMISM_PORTAL_SLOT =
        bytes32(uint256(keccak256("systemconfig.optimismportal")) - 1);
    bytes32 internal constant OPTIMISM_MINTABLE_ERC20_FACTORY_SLOT =
        bytes32(uint256(keccak256("systemconfig.optimismmintableerc20factory")) - 1);
    bytes32 internal constant BATCH_INBOX_SLOT = bytes32(uint256(keccak256("systemconfig.batchinbox")) - 1);
    bytes32 internal constant START_BLOCK_SLOT = bytes32(uint256(keccak256("systemconfig.startBlock")) - 1);

    constructor(
        address unsafeBlockSigner,
        address l1CrossDomainMessenger,
        address l1ERC721Bridge,
        address l1StandardBridge,
        address optimismPortal,
        address optimismMintableERC20Factory,
        address batchInbox
    ) {
        assembly {
            sstore(
                0x271e99f2d36cac79a3a9f1fe69f495a159d8e16c2dd6ba1f467f4d55b9ee847c,
                unsafeBlockSigner
            )
            sstore(
                0xbaa3c43b5d396cf718bd66c3da433a6fc277cca2ca81dac2f11caa1e781d4fc3,
                l1CrossDomainMessenger
            )
            sstore(
                0x0dcd989bca4b19b8c2ae74a7aabae8ac9c881b26be7376cdb62def2e8b400ec8,
                l1ERC721Bridge
            )
            sstore(
                0x30be4f8a5bfad47f2a8523e8dd3ece4423a63832a6d65d44b2fc9e5c0943e56e,
                l1StandardBridge
            )
            sstore(
                0x0d6be3d611d0d7b2b80fc2476c2a7244d5b64bfac19b116a53dcfe70e5e2b14b,
                optimismPortal
            )
            sstore(
                0x9ad8f8575df2d5cfaa6ea0ddac1debe5e2292a82d21165f9cbcf8959a5f7e0b6,
                optimismMintableERC20Factory
            )
            sstore(
                0x1a38a21cf847f16e59ea25a2a3f44995e351f39fac5780298b2ee7d13b03ba30,
                batchInbox
            )
            // allow deriving from block 0
            sstore(0x81a41a796a64ac2f6d8efe4c2384262c9f74bf126c62db8e4d8f1f9caffdb3a6, 0)
        }
    }
}
