// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal stub for future ZK batch verification.
/// @dev STUB: Does not perform real cryptographic proof verification.
///      Access is gated to a whitelist of authorised provers controlled by the owner.
///      Replace `verifyBatch` body with a real verifier call before production use.
contract ZkBatchVerifier {
    address public owner;
    mapping(address => bool) public authorizedProvers;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProverAuthorized(address indexed prover, bool allowed);
    event BatchVerified(uint256 indexed batchId, bytes32 batchRoot, address prover, bool accepted);

    error NotOwner();
    error NotAuthorized();
    error ZeroAddress();
    error EmptyProof();
    error BatchAlreadyVerified(uint256 batchId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProver() {
        if (!authorizedProvers[msg.sender]) revert NotAuthorized();
        _;
    }

    mapping(uint256 => bytes32) public verifiedRoot;

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setProver(address prover, bool allowed) external onlyOwner {
        if (prover == address(0)) revert ZeroAddress();
        authorizedProvers[prover] = allowed;
        emit ProverAuthorized(prover, allowed);
    }

    /// @notice Submit a batch proof. Authorised provers only.
    /// @dev Accepts any non-empty proof (stub). Replace with real verifier before production.
    function verifyBatch(bytes calldata proof, bytes32 batchRoot, uint256 batchId)
        external
        onlyProver
        returns (bool)
    {
        if (proof.length == 0) revert EmptyProof();
        if (verifiedRoot[batchId] != bytes32(0)) revert BatchAlreadyVerified(batchId);
        verifiedRoot[batchId] = batchRoot;
        emit BatchVerified(batchId, batchRoot, msg.sender, true);
        return true;
    }
}
