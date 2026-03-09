// GhostChain Contracts v5.6.1 (privacy/GhostNullifierRegistry.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostNullifierRegistry
/// @notice Core ZK privacy primitive for the GhostChain privacy layer.
///
///         Architecture:
///           • Maintains a Merkle commitment tree of note commitments.
///           • Records spent nullifiers to prevent double-spend.
///           • Accepts arbitrary verifier adapters implementing IZKVerifier.
///           • Chain-agnostic: deployed on L1, L2, and L3 independently.
///
///         The circuit flow:
///           1. Deposit: `deposit(commitment)` — inserts leaf into Merkle tree.
///           2. Withdraw: `withdraw(nullifier, root, recipient, proof)` — verifies ZK proof,
///              marks nullifier spent, releases funds.
///
/// @dev The actual ZK verifier is pluggable (zkSNARK or zkSTARK adapters).
///      This contract stores state; proof verification is delegated to `IZKVerifier`.

interface IZKVerifier {
    function verifyProof(
        bytes32 root,
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        bytes calldata proof
    ) external view returns (bool);
}

contract GhostNullifierRegistry is GhostBrand, ReentrancyGuard {

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant TREE_DEPTH   = 20;
    uint256 public constant MAX_LEAVES   = 1 << TREE_DEPTH;  // 2^20 = 1,048,576

    // ─── Storage ─────────────────────────────────────────────────────────────
    IZKVerifier public immutable VERIFIER;

    /// Incremental Merkle tree leaf index
    uint256 public nextLeafIndex;

    /// Leaf commitments (index → commitment)
    mapping(uint256 => bytes32) public leaves;

    /// Cached Merkle roots (root → valid)
    mapping(bytes32 => bool) public knownRoots;

    /// Nullifier spend registry (prevents double-spend)
    mapping(bytes32 => bool) public nullifiers;

    /// Denomination in GST base units (fixed-denomination notes for privacy)
    uint256 public immutable DENOMINATION;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Deposit(bytes32 indexed commitment, uint256 indexed leafIndex, uint256 timestamp);
    event Withdrawal(bytes32 indexed nullifier, address indexed recipient, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error TreeFull();
    error CommitmentAlreadyUsed();
    error NullifierAlreadySpent();
    error InvalidRoot();
    error InvalidProof();
    error WrongDenomination();

    // ─── Constructor ─────────────────────────────────────────────────────────
    /// @param verifier_      Address of the ZK proof verifier contract.
    /// @param denomination_  Fixed note size in GST base units (e.g. 1e18 = 1 GST).
    constructor(address verifier_, uint256 denomination_) {
        require(verifier_ != address(0), "verifier=0");
        require(denomination_ > 0,       "denomination=0");
        VERIFIER     = IZKVerifier(verifier_);
        DENOMINATION = denomination_;
        // Insert the zero root so the initial empty tree root is known
        knownRoots[_zeroRoot()] = true;
    }

    // ─── External: deposit ───────────────────────────────────────────────────
    /// @notice Deposit exactly `DENOMINATION` GST and register a commitment leaf.
    /// @param commitment  Pedersen/Poseidon commitment hash (circuit-generated off-chain).
    function deposit(bytes32 commitment) external payable nonReentrant {
        if (msg.value != DENOMINATION) revert WrongDenomination();
        if (nextLeafIndex >= MAX_LEAVES) revert TreeFull();
        if (leaves[nextLeafIndex] != bytes32(0)) revert CommitmentAlreadyUsed();

        uint256 idx = nextLeafIndex;
        leaves[idx] = commitment;
        nextLeafIndex = idx + 1;

        // Update known roots after insertion
        bytes32 newRoot = _computeRoot(idx, commitment);
        knownRoots[newRoot] = true;

        emit Deposit(commitment, idx, block.timestamp);
    }

    /// @notice Withdraw using a valid ZK proof.
    /// @param nullifier  Unique per-note spend token (prevents double-spend).
    /// @param root       Merkle root at time of proof generation (must be a known root).
    /// @param recipient  Recipient of the withdrawn GST funds.
    /// @param proof      ABI-encoded ZK proof bytes.
    function withdraw(
        bytes32 nullifier,
        bytes32 root,
        address payable recipient,
        bytes calldata proof
    ) external nonReentrant {
        if (nullifiers[nullifier])  revert NullifierAlreadySpent();
        if (!knownRoots[root])      revert InvalidRoot();

        bool valid = VERIFIER.verifyProof(root, nullifier, recipient, DENOMINATION, proof);
        if (!valid) revert InvalidProof();

        nullifiers[nullifier] = true;

        (bool ok,) = recipient.call{value: DENOMINATION}("");
        require(ok, "GhostNullifier: GST transfer failed");

        emit Withdrawal(nullifier, recipient, DENOMINATION);
    }

    // ─── View ─────────────────────────────────────────────────────────────────
    /// @notice Returns true if a nullifier has already been spent.
    function isSpent(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    /// @dev Simplified incremental root update — in production replace with
    ///      a full incremental Merkle tree using a Poseidon hasher.
    function _computeRoot(uint256 idx, bytes32 leaf) internal view returns (bytes32 root) {
        root = leaf;
        for (uint256 d = 0; d < TREE_DEPTH; d++) {
            bytes32 sibling = (idx & 1 == 0) ? bytes32(0) : leaves[idx ^ 1];
            if (idx & 1 == 0) {
                root = keccak256(abi.encode(root, sibling));
            } else {
                root = keccak256(abi.encode(sibling, root));
            }
            idx >>= 1;
        }
    }

    /// @dev The zero (empty) Merkle tree root for depth=TREE_DEPTH.
    function _zeroRoot() internal pure returns (bytes32 root) {
        root = bytes32(0);
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            root = keccak256(abi.encode(root, root));
        }
    }

    // ─── Receive ─────────────────────────────────────────────────────────────
    receive() external payable {}
}
