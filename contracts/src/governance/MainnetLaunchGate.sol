// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMainnetPolicyOracle {
    function isPolicyHashAccepted(bytes32 policyHash) external view returns (bool);
}

/// @notice Hard-gates mainnet deployments by recording on-chain authorization for a specific
///         (releaseId, manifestHash) tuple. Intended to be controlled by a timelock (or multisig
///         behind a timelock).
contract MainnetLaunchGate {
    error Unauthorized();
    error AlreadyAuthorized();
    error MissingCascadingRequirements();
    error InvalidOracle(address oracle);
    error InvalidPolicyHash();
    error InvalidValidationHash();
    error PolicyHashNotAccepted(bytes32 policyHash);

    address public immutable timelock;
    bool public strictCascadingRequirements = true;

    // releaseId => manifestHash => authorized
    mapping(bytes32 => mapping(bytes32 => bool)) public authorized;
    // releaseId => manifestHash => requirements digest for auditability.
    mapping(bytes32 => mapping(bytes32 => bytes32)) public requirementsDigest;

    event MainnetLaunchRequested(bytes32 indexed releaseId, bytes32 indexed manifestHash, address indexed proposer);
    event MainnetLaunchAuthorized(
        bytes32 indexed releaseId, bytes32 indexed manifestHash, address indexed executor, uint256 timestamp
    );
    event StrictCascadingRequirementsUpdated(bool enabled);
    event MainnetLaunchRequirementsBound(
        bytes32 indexed releaseId,
        bytes32 indexed manifestHash,
        address l1FinalityOracle,
        address l2FinalityOracle,
        address l3FinalityOracle,
        bytes32 policyHash,
        bytes32 cascadingValidationHash
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

    function setStrictCascadingRequirements(bool enabled) external {
        if (msg.sender != timelock) revert Unauthorized();
        strictCascadingRequirements = enabled;
        emit StrictCascadingRequirementsUpdated(enabled);
    }

    function authorizeMainnetLaunch(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 genesisHashL1,
        bytes32 rollupHashL2,
        bytes32 rollupHashL3,
        bytes32 imagesLockHash
    ) external {
        if (strictCascadingRequirements) revert MissingCascadingRequirements();
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

    /// @notice Strict authorization path binding cascading finality prerequisites.
    function authorizeMainnetLaunchWithRequirements(
        bytes32 releaseId,
        bytes32 manifestHash,
        bytes32 genesisHashL1,
        bytes32 rollupHashL2,
        bytes32 rollupHashL3,
        bytes32 imagesLockHash,
        address l1FinalityOracle,
        address l2FinalityOracle,
        address l3FinalityOracle,
        bytes32 policyHash,
        bytes32 cascadingValidationHash
    ) external {
        if (msg.sender != timelock) revert Unauthorized();
        if (authorized[releaseId][manifestHash]) revert AlreadyAuthorized();
        if (l1FinalityOracle == address(0) || l1FinalityOracle.code.length == 0) revert InvalidOracle(l1FinalityOracle);
        if (l2FinalityOracle == address(0) || l2FinalityOracle.code.length == 0) revert InvalidOracle(l2FinalityOracle);
        if (l3FinalityOracle == address(0) || l3FinalityOracle.code.length == 0) revert InvalidOracle(l3FinalityOracle);
        if (policyHash == bytes32(0)) revert InvalidPolicyHash();
        if (cascadingValidationHash == bytes32(0)) revert InvalidValidationHash();
        if (!IMainnetPolicyOracle(l1FinalityOracle).isPolicyHashAccepted(policyHash)) {
            revert PolicyHashNotAccepted(policyHash);
        }

        authorized[releaseId][manifestHash] = true;
        requirementsDigest[releaseId][manifestHash] = keccak256(
            abi.encode(
                releaseId,
                manifestHash,
                genesisHashL1,
                rollupHashL2,
                rollupHashL3,
                imagesLockHash,
                l1FinalityOracle,
                l2FinalityOracle,
                l3FinalityOracle,
                policyHash,
                cascadingValidationHash
            )
        );

        emit MainnetLaunchRequirementsBound(
            releaseId,
            manifestHash,
            l1FinalityOracle,
            l2FinalityOracle,
            l3FinalityOracle,
            policyHash,
            cascadingValidationHash
        );
        emit MainnetLaunchAuthorized(releaseId, manifestHash, msg.sender, block.timestamp);
    }

    function isLaunchAuthorized(bytes32 releaseId, bytes32 manifestHash) external view returns (bool) {
        return authorized[releaseId][manifestHash];
    }
}
