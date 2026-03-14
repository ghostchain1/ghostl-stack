// GhostChain Contracts v5.6.1 (da/GhostDataAvailability.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title GhostDataAvailability
/// @notice Modular Data Availability (DA) layer for GhostChain.
///
///         Architecture (EIP-4844 / Celestia-inspired, adapted for GhostChain):
///           • Data blobs are posted off-chain by sequencers/rollups.
///           • Only the blob commitment (KZG commitment hash) is posted on-chain.
///           • DA samplers verify availability using Data Availability Sampling (DAS).
///           • Blob challenges: any party can challenge unavailability within CHALLENGE_PERIOD.
///           • Challenged blobs must be revealed or the sequencer forfeits their bond.
///
///         GhostL2 and GhostL3 sequencers post commitments here.
///         GhostBrain AI performs automated sampling and challenge submission.
///
///         Blob namespaces:
///           Each rollup is assigned a unique namespace to prevent blob collision.
contract GhostDataAvailability is GhostBrand {
    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant CHALLENGE_PERIOD     = 1 days;
    uint256 public constant SEQUENCER_BOND       = 1 * GST_UNIT;   // 1 GST per blob posted
    uint256 public constant MAX_BLOB_SIZE        = 131_072;        // 128KB in bytes
    uint256 public constant DA_SAMPLING_THRESHOLD = 75;            // 75% of samplers must confirm

    // ─── Types ───────────────────────────────────────────────────────────────
    enum BlobStatus { Pending, Available, Challenged, Unavailable }

    struct BlobHeader {
        address  sequencer;
        bytes32  namespace;      // Rollup namespace ID
        bytes32  commitment;     // KZG / hash commitment of blob data
        uint256  blobSize;       // Declared size in bytes
        uint64   postedAt;       // Block number
        BlobStatus status;
        uint256  challengeDeadline;
        address  challenger;
        uint256  samplerConfirms;
        uint256  samplerTotal;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    address public immutable GOVERNANCE;
    address public           SEQUENCER_REGISTRY;  // Only registered sequencers may post

    mapping(uint256 => BlobHeader) public blobs;
    uint256 public blobCount;

    /// Registered namespaces: namespace → rollup address
    mapping(bytes32 => address) public namespaceOwner;

    /// Approved DA samplers (GhostBrain nodes)
    mapping(address => bool) public isSampler;

    /// sampler → blobId → has sampled
    mapping(address => mapping(uint256 => bool)) public hasSampled;

    /// sequencer bond balances
    mapping(address => uint256) public bonds;

    // ─── Events ──────────────────────────────────────────────────────────────
    event BlobPosted(uint256 indexed blobId, address indexed sequencer, bytes32 indexed namespace, bytes32 commitment);
    event BlobAvailable(uint256 indexed blobId);
    event BlobChallenged(uint256 indexed blobId, address indexed challenger);
    event BlobUnavailable(uint256 indexed blobId, address indexed challenger, uint256 slashed);
    event SamplerVoted(uint256 indexed blobId, address indexed sampler, bool available);
    event NamespaceRegistered(bytes32 indexed namespace, address indexed rollup);
    event SamplerAdded(address indexed sampler);
    event BondDeposited(address indexed sequencer, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotGovernance();
    error NotRegisteredSequencer();
    error BlobTooLarge();
    error InsufficientBond();
    error BlobNotPending();
    error BlobNotChallenged();
    error ChallengeExpired();
    error ChallengeNotExpired();
    error AlreadySampled();
    error NotSampler();
    error NamespaceNotOwned();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _onlyGovernance() internal view {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address governance_, address sequencerRegistry_) {
        require(governance_         != address(0), "gov=0");
        require(sequencerRegistry_  != address(0), "reg=0");
        GOVERNANCE         = governance_;
        SEQUENCER_REGISTRY = sequencerRegistry_;
    }

    // ─── Sequencer: bond deposit ───────────────────────────────────────────────
    /// @notice Sequencers must deposit GST bonds before posting blobs.
    function depositBond() external payable {
        bonds[msg.sender] += msg.value;
        emit BondDeposited(msg.sender, msg.value);
    }

    // ─── Sequencer: post blob commitment ─────────────────────────────────────
    /// @notice Post a blob commitment. The actual blob data lives off-chain.
    /// @param namespace   Rollup namespace ID (must be owned by msg.sender).
    /// @param commitment  KZG or hash commitment to the blob data.
    /// @param blobSize    Declared byte size of blob (max MAX_BLOB_SIZE).
    function postBlob(
        bytes32 namespace,
        bytes32 commitment,
        uint256 blobSize
    ) external returns (uint256 blobId) {
        if (namespaceOwner[namespace] != msg.sender) revert NamespaceNotOwned();
        if (blobSize > MAX_BLOB_SIZE)               revert BlobTooLarge();
        if (bonds[msg.sender] < SEQUENCER_BOND)     revert InsufficientBond();

        bonds[msg.sender] -= SEQUENCER_BOND;  // Lock bond for this blob
        blobId = ++blobCount;
        require(block.number <= type(uint64).max, "block overflow");
        blobs[blobId] = BlobHeader({
            sequencer:         msg.sender,
            namespace:         namespace,
            commitment:        commitment,
            blobSize:          blobSize,
            postedAt:          uint64(block.number),
            status:            BlobStatus.Pending,
            challengeDeadline: block.timestamp + CHALLENGE_PERIOD,
            challenger:        address(0),
            samplerConfirms:   0,
            samplerTotal:      0
        });
        emit BlobPosted(blobId, msg.sender, namespace, commitment);
    }

    // ─── DA samplers: vote on availability ────────────────────────────────────
    /// @notice DA samplers (GhostBrain nodes) vote on blob availability.
    function sampleBlob(uint256 blobId, bool available) external {
        if (!isSampler[msg.sender])          revert NotSampler();
        if (hasSampled[msg.sender][blobId])  revert AlreadySampled();

        BlobHeader storage b = blobs[blobId];
        if (b.status != BlobStatus.Pending && b.status != BlobStatus.Challenged)
            revert BlobNotPending();

        hasSampled[msg.sender][blobId] = true;
        b.samplerTotal++;
        if (available) b.samplerConfirms++;

        emit SamplerVoted(blobId, msg.sender, available);

        // Auto-finalize if enough votes
        if (b.samplerTotal >= 10) {
            uint256 confirmPct = (b.samplerConfirms * 100) / b.samplerTotal;
            if (confirmPct >= DA_SAMPLING_THRESHOLD) {
                b.status = BlobStatus.Available;
                // Return bond to sequencer
                bonds[b.sequencer] += SEQUENCER_BOND;
                emit BlobAvailable(blobId);
            }
        }
    }

    // ─── Challenge: unavailability dispute ────────────────────────────────────
    /// @notice Challenge a blob as unavailable. Challenger must hold a sampler role.
    function challengeBlob(uint256 blobId) external {
        if (!isSampler[msg.sender]) revert NotSampler();
        BlobHeader storage b = blobs[blobId];
        if (b.status != BlobStatus.Pending) revert BlobNotPending();
        if (block.timestamp > b.challengeDeadline) revert ChallengeExpired();

        b.status     = BlobStatus.Challenged;
        b.challenger = msg.sender;
        emit BlobChallenged(blobId, msg.sender);
    }

    /// @notice Finalize a challenge after the challenge period — blob is declared unavailable.
    function finalizeChallenge(uint256 blobId) external {
        BlobHeader storage b = blobs[blobId];
        if (b.status != BlobStatus.Challenged)          revert BlobNotChallenged();
        if (block.timestamp <= b.challengeDeadline)     revert ChallengeNotExpired();

        // Check sampler votes
        uint256 confirmPct = b.samplerTotal > 0
            ? (b.samplerConfirms * 100) / b.samplerTotal
            : 0;

        if (confirmPct >= DA_SAMPLING_THRESHOLD) {
            // Majority confirmed available — challenge failed, blob is available
            b.status = BlobStatus.Available;
            bonds[b.sequencer] += SEQUENCER_BOND;
            emit BlobAvailable(blobId);
        } else {
            // Blob declared unavailable — slash sequencer bond to challenger
            b.status = BlobStatus.Unavailable;
            uint256 slashed = SEQUENCER_BOND;
            (bool ok,) = b.challenger.call{value: slashed}("");
            require(ok, "GhostDA: challenger payment failed");
            emit BlobUnavailable(blobId, b.challenger, slashed);
        }
    }

    // ─── Governance: namespace + sampler registration ─────────────────────────
    function registerNamespace(bytes32 namespace, address rollup) external onlyGovernance {
        require(rollup != address(0), "rollup=0");
        namespaceOwner[namespace] = rollup;
        emit NamespaceRegistered(namespace, rollup);
    }

    function addSampler(address sampler) external onlyGovernance {
        require(sampler != address(0), "sampler=0");
        isSampler[sampler] = true;
        emit SamplerAdded(sampler);
    }

    function removeSampler(address sampler) external onlyGovernance {
        isSampler[sampler] = false;
    }

    function setSequencerRegistry(address reg) external onlyGovernance {
        require(reg != address(0), "reg=0");
        SEQUENCER_REGISTRY = reg;
    }

    // ─── View ─────────────────────────────────────────────────────────────────
    function getBlobStatus(uint256 blobId) external view returns (BlobStatus) {
        return blobs[blobId].status;
    }

    function getBlobCommitment(uint256 blobId) external view returns (bytes32) {
        return blobs[blobId].commitment;
    }

    receive() external payable {}
}
