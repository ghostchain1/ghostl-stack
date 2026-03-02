// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "./TreasuryInvariants.sol";

/// @title ProofOfSolvency
/// @notice Generates on-chain Merkle-root attestations that prove the treasury
///         holds at least its declared liabilities.
///
///         Each attestation snapshot contains:
///           – NAV (total asset value)
///           – Liabilities (ops runway, payroll, debt obligations)
///           – Surplus (NAV - liabilities)
///           – Asset Merkle root (leaf: abi.encode(token, balance))
///           – IPFS CID of the full off-chain report (optional, for audit)
///
///         Attestations are append-only and immutable once published.
///         The contract can verify a leaf against the latest snapshot root.
contract ProofOfSolvency is Governed {
    // ─── Types ────────────────────────────────────────────────────────────────

    struct Snapshot {
        uint256 id;
        /// @dev unix timestamp of attestation
        uint48  timestamp;
        /// @dev total asset value in wei
        uint256 nav;
        /// @dev total declared liabilities in wei
        uint256 liabilities;
        /// @dev nav - liabilities (reverts on insolvency; must be ≥ 0)
        uint256 surplus;
        /// @dev Merkle root of asset leaves [abi.encode(token, balance)]
        bytes32 assetRoot;
        /// @dev IPFS CID of full report (optional; bytes32(0) if omitted)
        bytes32 ipfsCID;
        /// @dev address that published this snapshot
        address publisher;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public snapshotCount;
    mapping(uint256 => Snapshot) private _snapshots;

    /// @dev accounts authorised to publish snapshots (AI attestors)
    mapping(address => bool) public publishers;

    // ─── Events ───────────────────────────────────────────────────────────────

    event SnapshotPublished(
        uint256 indexed id,
        uint256 nav,
        uint256 liabilities,
        uint256 surplus,
        bytes32 assetRoot,
        bytes32 ipfsCID,
        address indexed publisher
    );
    event PublisherSet(address indexed account, bool enabled);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotPublisher();
    error Insolvent(uint256 nav, uint256 liabilities);
    error SnapshotNotFound(uint256 id);
    error InvalidLeaf();
    error InvalidProof();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    // ─── Publisher management ─────────────────────────────────────────────────

    function setPublisher(address account, bool enabled) external onlyGovernance {
        publishers[account] = enabled;
        emit PublisherSet(account, enabled);
    }

    // ─── Snapshot publication ─────────────────────────────────────────────────

    /// @notice Publish a new solvency snapshot.
    /// @param nav          Total asset value in wei.
    /// @param liabilities  Total declared liabilities in wei.
    /// @param assetRoot    Merkle root of [abi.encode(token, balance)] leaves.
    /// @param ipfsCID      IPFS CID of full auditor report (bytes32(0) to omit).
    function publish(
        uint256 nav,
        uint256 liabilities,
        bytes32 assetRoot,
        bytes32 ipfsCID
    ) external returns (uint256 id) {
        if (!publishers[msg.sender] && msg.sender != owner) revert NotPublisher();
        if (nav < liabilities) revert Insolvent(nav, liabilities);

        id = ++snapshotCount;
        _snapshots[id] = Snapshot({
            id:          id,
            timestamp:   uint48(block.timestamp),
            nav:         nav,
            liabilities: liabilities,
            surplus:     nav - liabilities,
            assetRoot:   assetRoot,
            ipfsCID:     ipfsCID,
            publisher:   msg.sender
        });

        emit SnapshotPublished(id, nav, liabilities, nav - liabilities, assetRoot, ipfsCID, msg.sender);
    }

    // ─── Verification ─────────────────────────────────────────────────────────

    /// @notice Verify that a (token, balance) leaf is included in a given snapshot.
    /// @param snapshotId  Target snapshot.
    /// @param token       ERC-20 address (address(0) for native).
    /// @param balance     Declared balance in wei.
    /// @param proof       Merkle proof (sibling hashes from leaf to root).
    function verifyAsset(
        uint256         snapshotId,
        address         token,
        uint256         balance,
        bytes32[] calldata proof
    ) external view returns (bool) {
        Snapshot storage s = _requireSnapshot(snapshotId);
        bytes32 leaf  = keccak256(abi.encode(token, balance));
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            // Sort pair to match standard Merkle construction
            if (computed <= sibling) {
                computed = keccak256(abi.encode(computed, sibling));
            } else {
                computed = keccak256(abi.encode(sibling, computed));
            }
        }
        return computed == s.assetRoot;
    }

    /// @notice Quick solvency check: returns true if latest snapshot is solvent.
    function isSolvent() external view returns (bool) {
        if (snapshotCount == 0) return false;
        Snapshot storage s = _snapshots[snapshotCount];
        return s.nav >= s.liabilities;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getSnapshot(uint256 id) external view returns (Snapshot memory) {
        return _requireSnapshot(id);
    }

    function latestSnapshot() external view returns (Snapshot memory) {
        if (snapshotCount == 0) revert SnapshotNotFound(0);
        return _snapshots[snapshotCount];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _requireSnapshot(uint256 id) internal view returns (Snapshot storage) {
        if (id == 0 || id > snapshotCount) revert SnapshotNotFound(id);
        return _snapshots[id];
    }
}
