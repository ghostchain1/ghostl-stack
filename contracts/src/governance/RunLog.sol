// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain log of automation runs (hash anchors).
/// @dev Designed for custom governance: set `executor` to your ProposalExecutor-like contract.
///      Can be configured so only executor can record runs, OR allow recorded operators.
///      Here: only executor can record (strict mode).
contract RunLog {
    error NotExecutor(address caller);
    error ZeroAddress();

    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);

    /// @notice emitted for each run:
    /// runHash = hash of (diff + reports + config) produced off-chain
    /// policyHash = the policy hash used for the run (binds to constitution)
    /// uri = optional reference to artifact bundle (IPFS, S3, etc.)
    event RunRecorded(
        bytes32 indexed runHash,
        bytes32 indexed policyHash,
        address indexed operator,
        string uri
    );

    address public executor;

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor(msg.sender);
        _;
    }

    constructor(address initialExecutor) {
        if (initialExecutor == address(0)) revert ZeroAddress();
        executor = initialExecutor;
        emit ExecutorUpdated(address(0), initialExecutor);
    }

    function setExecutor(address newExecutor) external onlyExecutor {
        if (newExecutor == address(0)) revert ZeroAddress();
        address old = executor;
        executor = newExecutor;
        emit ExecutorUpdated(old, newExecutor);
    }

    /// @notice Record a run hash anchored to current governance policy.
    /// @param runHash Hash of the run bundle (diff+reports+sboms+attestation)
    /// @param policyHash The PolicyRegistry.policyHash used for the run
    /// @param operator The off-chain operator identity (wallet/address) for attribution
    /// @param uri Optional pointer to full bundle (IPFS CID / object store URL / etc.)
    function recordRun(
        bytes32 runHash,
        bytes32 policyHash,
        address operator,
        string calldata uri
    ) external onlyExecutor {
        emit RunRecorded(runHash, policyHash, operator, uri);
    }
}
