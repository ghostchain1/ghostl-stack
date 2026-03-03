// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          GhostChain · GhostBrain AI Contract Evolution System           ║
// ║  Self-learning · Self-evolving · Autonomous · GhostStack v2             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// @title  GhostBrainCompilerOracle
/// @notice Records on-chain the results of every autonomous forge compile
///         cycle run by the GhostBrain Contract Engine.
///
///         Each compilation run anchors:
///           - source tree commit hash (git SHA)
///           - solc version used
///           - number of files compiled / errors / warnings
///           - aggregate bytecode hash (keccak256 of all output bytecodes)
///           - build duration (milliseconds, off-chain measured)
///           - whether the compile gate passed (no errors)
///
/// @dev    Only COMPILER_ROLE may write.  Results are immutable once anchored.
///         A compile-gate check function is exposed so that GhostUpgradeGovernor
///         can require a clean compile before ratifying any upgrade proposal.
contract GhostBrainCompilerOracle {

    // ─── Roles ────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant COMPILER_ROLE = keccak256("COMPILER_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ─── Types ────────────────────────────────────────────────────────────

    enum BuildProfile { DEFAULT, LEGACY, IR_OPTIMISED }

    struct CompileResult {
        uint64       id;
        bytes32      gitCommit;        // short SHA of the source tree
        string       solcVersion;      // e.g. "0.8.24"
        BuildProfile profile;
        uint32       filesCompiled;
        uint32       errorCount;
        uint32       warningCount;
        /// @dev keccak256 of concatenated sorted contractName:bytecodeHash
        bytes32      aggregateBytecodeHash;
        /// @dev compile wall-clock time in milliseconds
        uint32       durationMs;
        bool         passed;           // errorCount == 0
        address      compiler;         // off-chain service address
        uint256      timestamp;
        uint256      blockNumber;
        /// @dev optional notes from AI (e.g. "fixed 3 errors auto")
        bytes        notes;
    }

    uint64 public resultCount;
    mapping(uint64 => CompileResult) public results;

    /// @dev latest passing result id
    uint64 public latestPassingId;
    /// @dev latest result id (pass or fail)
    uint64 public latestId;

    // ─── Events ───────────────────────────────────────────────────────────

    event CompileAnchored(
        uint64  indexed id,
        bytes32 indexed gitCommit,
        bool            passed,
        uint32          errorCount,
        uint32          filesCompiled,
        bytes32         aggregateBytecodeHash,
        address indexed compiler
    );

    event LatestPassingUpdated(uint64 id, bytes32 gitCommit);

    // ─── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error NoPassingResult();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address admin_) {
        _grantRole(ADMIN_ROLE,    admin_);
        _grantRole(COMPILER_ROLE, admin_);
    }

    // ─── Access control ───────────────────────────────────────────────────

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    function grantRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _roles[role][account] = false;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    // ─── Core: anchor compile result ──────────────────────────────────────

    /// @notice Anchor a compile result on-chain.
    function anchor(
        bytes32       gitCommit,
        string calldata solcVersion,
        BuildProfile  profile,
        uint32        filesCompiled,
        uint32        errorCount,
        uint32        warningCount,
        bytes32       aggregateBytecodeHash,
        uint32        durationMs,
        bytes calldata notes
    ) external onlyRole(COMPILER_ROLE) returns (uint64 id) {
        unchecked { id = ++resultCount; }

        bool passed = errorCount == 0;

        results[id] = CompileResult({
            id:                    id,
            gitCommit:             gitCommit,
            solcVersion:           solcVersion,
            profile:               profile,
            filesCompiled:         filesCompiled,
            errorCount:            errorCount,
            warningCount:          warningCount,
            aggregateBytecodeHash: aggregateBytecodeHash,
            durationMs:            durationMs,
            passed:                passed,
            compiler:              msg.sender,
            timestamp:             block.timestamp,
            blockNumber:           block.number,
            notes:                 notes
        });

        latestId = id;
        if (passed) {
            latestPassingId = id;
            emit LatestPassingUpdated(id, gitCommit);
        }

        emit CompileAnchored(id, gitCommit, passed, errorCount, filesCompiled, aggregateBytecodeHash, msg.sender);
    }

    // ─── Gate check (called by upgrade governor) ──────────────────────────

    /// @notice Returns true iff the latest anchored result is a passing build.
    ///         Reverts if no results have been anchored yet.
    function assertCleanBuild() external view {
        if (resultCount == 0) revert NoPassingResult();
        CompileResult storage r = results[latestId];
        require(r.passed, "GhostBrainCompilerOracle: latest build failed");
    }

    /// @notice Returns true iff the result for the given git commit is passing.
    function isCommitClean(bytes32 gitCommit) external view returns (bool) {
        for (uint64 i = resultCount; i >= 1; ) {
            if (results[i].gitCommit == gitCommit) return results[i].passed;
            unchecked { --i; }
        }
        return false;
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getResult(uint64 id) external view returns (CompileResult memory) {
        return results[id];
    }

    function getLatestPassing() external view returns (CompileResult memory) {
        if (latestPassingId == 0) revert NoPassingResult();
        return results[latestPassingId];
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
    }
}
