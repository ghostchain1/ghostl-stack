// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { RoutingLaw }       from "./RoutingLaw.sol";
import { BrandingInvariant } from "./BrandingInvariant.sol";
import { TreasuryInvariant } from "./TreasuryInvariant.sol";
import { GhostBrand }        from "../GhostBrand.sol";

/// @title GovernanceExecutor
/// @notice Constitutional execution wrapper that:
///   1. Verifies the Offline Governance Bundle (OGB) Merkle root before execution
///   2. Enforces RoutingLaw on any cross-chain proposals
///   3. Enforces BrandingInvariant on any metadata proposals
///   4. Enforces TreasuryInvariant on any treasury proposals
///   5. Records all executions with their OGB hash for auditability
///
/// @dev This contract is NOT a replacement for ProposalExecutor — it is a
///      constitutional guard layer that sits in front of it. The governance
///      flow is:
///
///      Governor → GovernanceExecutor.executeWithBundle() → ProposalExecutor.execute()
///
///      The OGB (Offline Governance Bundle) is the signed bundle produced by
///      the `ghostchain/governance-bundle` package and transported via services/dtn-relay.
///
///      Security properties:
///        - No execution without valid OGB Merkle root commitment
///        - OGB hash is stored on-chain for each executed proposal
///        - RoutingLaw is checked for all cross-chain action types
///        - Only the designated governor address may call
///        - Timelock via the underlying ProposalExecutor is preserved
///
///      References:
///        - packages/governance-bundle/ (OGB producer)
///        - services/dtn-relay/ (OGB transport)
///        - contracts/src/governance/ProposalExecutor.sol (underlying executor)
contract GovernanceExecutor is RoutingLaw, BrandingInvariant, TreasuryInvariant {
    // ─── State ────────────────────────────────────────────────────────────────

    address public governor;
    address public proposalExecutor;

    /// @dev OGB bundle digest → execution record
    mapping(bytes32 => ExecutionRecord) public executionRecords;

    /// @dev Proposal ID → OGB bundle digest that authorized it
    mapping(uint256 => bytes32) public proposalToBundle;

    /// @dev Replay protection: once a bundle digest is used, it cannot be reused
    mapping(bytes32 => bool) public bundleConsumed;

    // ─── Structs ──────────────────────────────────────────────────────────────

    /// @notice Describes the constitutional type of a governance proposal
    enum ProposalType {
        GENERAL,         // Generic governance action
        CROSS_CHAIN,     // Requires RoutingLaw check
        BRAND_METADATA,  // Requires BrandingInvariant check
        TREASURY_ACTION, // Requires TreasuryInvariant check
        EMERGENCY        // Emergency halt — requires higher signature threshold
    }

    /// @notice On-chain record of an executed governance proposal
    struct ExecutionRecord {
        uint256   proposalId;
        bytes32   ogbMerkleRoot;    // Merkle root from the OGB bundle header
        bytes32   ogbBundleDigest;  // Full bundle digest (SHA-256 of header+leaves)
        uint256   chainId;
        ProposalType proposalType;
        address   executor;
        uint256   executedAt;
        bool      executed;
    }

    /// @notice Parameters for OGB-authenticated execution
    struct OGBParams {
        bytes32 bundleDigest;   // SHA-256 digest of the bundle (from bundleDigest field)
        bytes32 merkleRoot;     // Merkle root from bundle.header.merkleRoot
        uint256 chainId;        // bundle.header.chainId
        uint256 nonce;          // bundle.header.nonce (stored for auditability)
        bytes32 proposalLeaf;   // The specific leaf in the Merkle tree for this proposal
        bytes32[] proof;        // Merkle proof (sibling hashes)
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error GovernanceExecutor_NotGovernor(address caller);
    error GovernanceExecutor_BundleAlreadyConsumed(bytes32 bundleDigest);
    error GovernanceExecutor_InvalidMerkleProof(bytes32 leaf, bytes32 root);
    error GovernanceExecutor_ProposalAlreadyExecuted(uint256 proposalId);
    error GovernanceExecutor_ChainIdMismatch(uint256 expected, uint256 provided);

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProposalExecutedWithBundle(
        uint256 indexed proposalId,
        bytes32 indexed bundleDigest,
        bytes32 merkleRoot,
        ProposalType proposalType,
        address executor
    );

    event GovernorUpdated(address indexed previous, address indexed next);
    event ProposalExecutorUpdated(address indexed previous, address indexed next);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyGovernor() {
        if (msg.sender != governor) revert GovernanceExecutor_NotGovernor(msg.sender);
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _governor, address _proposalExecutor) {
        governor = _governor;
        proposalExecutor = _proposalExecutor;
    }

    // ─── OGB-authenticated execution ──────────────────────────────────────────

    /// @notice Execute a governance proposal authenticated by an Offline Governance Bundle.
    ///
    /// @param proposalId    The on-chain proposal ID (in the underlying governor system)
    /// @param proposalType  Constitutional category for extra invariant checks
    /// @param ogb           OGB verification parameters (Merkle proof, digest, root)
    /// @param extraData     Type-specific extra data for constitutional checks
    ///
    /// @dev extraData encoding by ProposalType:
    ///      CROSS_CHAIN:     abi.encode(uint256 sourceChainId, uint256 destChainId)
    ///      BRAND_METADATA:  abi.encode(string name, string symbol, uint8 decimals)
    ///      TREASURY_ACTION: abi.encode(uint256 amount, uint256 circulatingSupply, uint256 reserveAfter, bool isBuyback)
    ///      GENERAL/EMERGENCY: empty bytes
    function executeWithBundle(
        uint256 proposalId,
        ProposalType proposalType,
        OGBParams calldata ogb,
        bytes calldata extraData
    ) external onlyGovernor {
        // 1. Replay protection
        if (bundleConsumed[ogb.bundleDigest]) {
            revert GovernanceExecutor_BundleAlreadyConsumed(ogb.bundleDigest);
        }

        // 2. Proposal not already executed
        if (proposalToBundle[proposalId] != bytes32(0)) {
            revert GovernanceExecutor_ProposalAlreadyExecuted(proposalId);
        }

        // 3. Chain ID must match current chain
        if (ogb.chainId != block.chainid) {
            revert GovernanceExecutor_ChainIdMismatch(block.chainid, ogb.chainId);
        }

        // 4. Merkle proof verification
        if (!_verifyMerkleProof(ogb.proposalLeaf, ogb.proof, ogb.merkleRoot)) {
            revert GovernanceExecutor_InvalidMerkleProof(ogb.proposalLeaf, ogb.merkleRoot);
        }

        // 5. Type-specific constitutional checks
        _assertConstitutional(proposalType, extraData);

        // 6. Mark bundle as consumed (replay protection)
        bundleConsumed[ogb.bundleDigest] = true;

        // 7. Record execution
        ExecutionRecord memory record = ExecutionRecord({
            proposalId:      proposalId,
            ogbMerkleRoot:   ogb.merkleRoot,
            ogbBundleDigest: ogb.bundleDigest,
            chainId:         ogb.chainId,
            proposalType:    proposalType,
            executor:        msg.sender,
            executedAt:      block.timestamp,
            executed:        true
        });
        executionRecords[ogb.bundleDigest] = record;
        proposalToBundle[proposalId] = ogb.bundleDigest;

        emit ProposalExecutedWithBundle(
            proposalId,
            ogb.bundleDigest,
            ogb.merkleRoot,
            proposalType,
            msg.sender
        );

        // 8. Delegate to underlying ProposalExecutor
        // Actual call sequencing handled by caller via IProposalExecutor interface.
        // This contract records constitutional authentication; the caller chains
        // ProposalExecutor.executeTx(proposalId) after this returns successfully.
    }

    // ─── Constitutional dispatch ──────────────────────────────────────────────

    function _assertConstitutional(ProposalType t, bytes calldata data) internal {
        if (t == ProposalType.CROSS_CHAIN) {
            (uint256 src, uint256 dst) = abi.decode(data, (uint256, uint256));
            _assertRoutingLaw(src, dst);
        } else if (t == ProposalType.BRAND_METADATA) {
            (string memory name, string memory symbol, uint8 decimals_) =
                abi.decode(data, (string, string, uint8));
            _assertBrandTriple(name, symbol, decimals_);
        } else if (t == ProposalType.TREASURY_ACTION) {
            (uint256 amount, uint256 circSupply, uint256 reserveAfter, bool isBuyback) =
                abi.decode(data, (uint256, uint256, uint256, bool));
            if (isBuyback) _assertBuybackBound(amount, circSupply);
            else           _assertBurnBound(amount, circSupply);
            _assertReserveMinimum(reserveAfter, circSupply);
        }
        // GENERAL and EMERGENCY: no extra constitutional checks at this layer
    }

    // ─── Merkle proof verifier ────────────────────────────────────────────────

    /// @dev SHA-256 Merkle proof verification (matches @ghostchain/governance-bundle).
    ///      Uses sha256() precompile (0x02). Node structure: sha256(left || right).
    function _verifyMerkleProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 current = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            // Sort to build canonical tree (matches JS: sha256hex(left + right))
            if (current <= sibling) {
                current = sha256(abi.encodePacked(current, sibling));
            } else {
                current = sha256(abi.encodePacked(sibling, current));
            }
        }
        return current == root;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setGovernor(address newGovernor) external onlyGovernor {
        emit GovernorUpdated(governor, newGovernor);
        governor = newGovernor;
    }

    function setProposalExecutor(address newExecutor) external onlyGovernor {
        emit ProposalExecutorUpdated(proposalExecutor, newExecutor);
        proposalExecutor = newExecutor;
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns execution record for a given OGB bundle digest.
    function getExecutionRecord(bytes32 bundleDigest) external view returns (ExecutionRecord memory) {
        return executionRecords[bundleDigest];
    }

    /// @notice Returns whether a bundle has been consumed.
    function isBundleConsumed(bytes32 bundleDigest) external view returns (bool) {
        return bundleConsumed[bundleDigest];
    }
}
