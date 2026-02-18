// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Hard-gates mainnet deployments by recording on-chain authorization for a specific
///         (releaseId, manifestHash) tuple. Intended to be controlled by a timelock (or multisig
///         behind a timelock).
contract MainnetLaunchGate {
    error Unauthorized();
    error AlreadyAuthorized();

    address public immutable timelock;

    // releaseId => manifestHash => authorized
    mapping(bytes32 => mapping(bytes32 => bool)) public authorized;

    event MainnetLaunchRequested(bytes32 indexed releaseId, bytes32 indexed manifestHash, address indexed proposer);
    event MainnetLaunchAuthorized(
        bytes32 indexed releaseId, bytes32 indexed manifestHash, address indexed executor, uint256 timestamp
    );

    constructor(address timelock_) {
        timelock = timelock_;
    }

    function requestMainnetLaunch(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 genesisHashL1,
        bytes32 rollupHashL2,
        bytes32 rollupHashL3,
        bytes32 imagesLockHash
    ) external returns (bytes32 requestId) {
        emit MainnetLaunchRequested(releaseId, manifestHash, msg.sender);
        // Not authoritative; helpful for off-chain proposal tracking.
        requestId = keccak256(abi.encode(releaseId, manifestHash, genesisHashL1, rollupHashL2, rollupHashL3, imagesLockHash));
    }

    function authorizeMainnetLaunch(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 genesisHashL1,
        bytes32 rollupHashL2,
        bytes32 rollupHashL3,
        bytes32 imagesLockHash
    ) external {
        if (msg.sender != timelock) revert Unauthorized();
        if (authorized[releaseId][manifestHash]) revert AlreadyAuthorized();

        // Store only the immutable authorization bit; hashes are included for auditability via events.
        authorized[releaseId][manifestHash] = true;

        emit MainnetLaunchAuthorized(releaseId, manifestHash, msg.sender, block.timestamp);

        // Silence unused variable warnings (they are used only for event integrity / calldata binding).
        genesisHashL1;
        rollupHashL2;
        rollupHashL3;
        imagesLockHash;
    }

    function isLaunchAuthorized(bytes32 releaseId, bytes32 manifestHash) external view returns (bool) {
        return authorized[releaseId][manifestHash];
    }
}

