// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (opstack/GhostOutputOracle.sol)
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { GhostOwnable } from "../ghost/GhostOwnable.sol";

/// @title  GhostOutputOracle
/// @notice GhostChain-native Output Oracle for L2→L1 and L3→L2 rollup output
///         commitment storage. Drop-in replacement for the OP Stack
///         L2OutputOracle with GhostChain branding, chain-ID enforcement,
///         and challenger/dispute support.
///
///         Lifecycle:
///           1. The designated proposer calls proposeL2Output() after each
///              submission interval to commit an output root at a given
///              L2 (or L3) block number.
///           2. During the finalization period the challenger may call
///              deleteL2Outputs() to prune invalid proposals.
///           3. After finalizationPeriodSeconds has elapsed the output
///              is considered final and cannot be deleted.
///
///         Compatible with the ABI used by:
///           - services/consensus-telemetry-service (fetchOutputOracleSnapshot)
///           - services/ghostos-core   (l3OracleReady probe)
///           - infra/opstack proposer  (op-proposer binary)
///
/// @dev    Chain-ID parameters are stored as immutables and validated
///         on construction.  Use L3_CHAIN_ID / L2_CHAIN_ID from
///         GhostBrand when deploying Layer-3 → Layer-2 oracle instances.
contract GhostOutputOracle is GhostBrand, GhostOwnable {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct OutputProposal {
        bytes32 outputRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Immutable configuration (set once at construction)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Block interval between consecutive output proposals.
    uint256 public immutable SUBMISSION_INTERVAL;

    /// @notice Expected L2/L3 block time in seconds.
    uint256 public immutable L2_BLOCK_TIME;

    /// @notice First L2/L3 block number tracked by this oracle.
    uint256 public immutable STARTING_BLOCK_NUMBER;

    /// @notice L1/L2 timestamp at STARTING_BLOCK_NUMBER (seconds).
    uint256 public immutable STARTING_TIMESTAMP;

    /// @notice Address authorised to propose outputs.
    address public immutable PROPOSER;

    /// @notice Address authorised to challenge/delete outputs during the
    ///         finalization window.
    address public immutable CHALLENGER;

    /// @notice Seconds after which a proposed output becomes final.
    uint256 public immutable FINALIZATION_PERIOD_SECONDS;

    /// @notice GhostChain child chain ID that this oracle tracks outputs for.
    ///         Use L2_CHAIN_ID (901) for L2→L1 oracles,
    ///         L3_CHAIN_ID (903) for L3→L2 oracles.
    uint256 public immutable CHILD_CHAIN_ID;

    /// @notice GhostChain parent chain ID that this oracle is *deployed on*.
    uint256 public immutable PARENT_CHAIN_ID;

    // ─────────────────────────────────────────────────────────────────────────
    // Mutable state
    // ─────────────────────────────────────────────────────────────────────────

    OutputProposal[] internal _outputs;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new output root is proposed.
    event OutputProposed(
        bytes32 indexed outputRoot,
        uint256 indexed l2OutputIndex,
        uint256 indexed l2BlockNumber,
        bytes32 l1BlockHash,
        uint256 l1BlockNumber,
        address proposer
    );

    /// @notice Emitted when the challenger prunes proposals.
    event OutputsDeleted(uint256 indexed prevNextOutputIndex, uint256 indexed newNextOutputIndex);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error GhostOracle__NotProposer();
    error GhostOracle__NotChallenger();
    error GhostOracle__TooEarlyToPropose(uint256 expected, uint256 got);
    error GhostOracle__BadBlockHash();
    error GhostOracle__NonMonotonicBlockNumber();
    error GhostOracle__OutputAlreadyFinalized();
    error GhostOracle__NotEnoughOutputs();
    error GhostOracle__ZeroOutputRoot();
    error GhostOracle__ChainIdMismatch(uint256 expected, uint256 got);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @param _submissionInterval    Output proposal interval (blocks).
    /// @param _l2BlockTime           Child chain block time (seconds).
    /// @param _startingBlockNumber   First child-chain block tracked.
    /// @param _startingTimestamp     Parent-chain timestamp at starting block.
    /// @param _proposer              Address authorised to submit outputs.
    /// @param _challenger            Address authorised to delete unfinalized outputs.
    /// @param _finalizationPeriodSeconds  Window before an output becomes final.
    /// @param _childChainId          GhostChain child chain ID (901 or 903).
    /// @param _parentChainId         GhostChain parent chain ID (14000101 or 901).
    /// @param _owner                 Initial owner (governance multisig / GhostChainGovernor).
    constructor(
        uint256 _submissionInterval,
        uint256 _l2BlockTime,
        uint256 _startingBlockNumber,
        uint256 _startingTimestamp,
        address _proposer,
        address _challenger,
        uint256 _finalizationPeriodSeconds,
        uint256 _childChainId,
        uint256 _parentChainId,
        address _owner
    ) GhostOwnable(_owner) {
        require(_submissionInterval > 0, "GhostOutputOracle: zero interval");
        require(_l2BlockTime > 0,        "GhostOutputOracle: zero block time");
        require(_proposer  != address(0), "GhostOutputOracle: zero proposer");
        require(_challenger != address(0), "GhostOutputOracle: zero challenger");

        // Enforce canonical GhostChain chain-ID pairs
        bool validPair = (
            (_childChainId == L2_CHAIN_ID  && _parentChainId == L1_CHAIN_ID) ||
            (_childChainId == L3_CHAIN_ID  && _parentChainId == L2_CHAIN_ID)
        );
        require(validPair, "GhostOutputOracle: invalid chain-ID pair");

        SUBMISSION_INTERVAL         = _submissionInterval;
        L2_BLOCK_TIME               = _l2BlockTime;
        STARTING_BLOCK_NUMBER       = _startingBlockNumber;
        STARTING_TIMESTAMP          = _startingTimestamp;
        PROPOSER                    = _proposer;
        CHALLENGER                  = _challenger;
        FINALIZATION_PERIOD_SECONDS = _finalizationPeriodSeconds;
        CHILD_CHAIN_ID              = _childChainId;
        PARENT_CHAIN_ID             = _parentChainId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OP Stack–compatible views (used by op-proposer, consensus-telemetry-service)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Semantic version — returned by consensus-telemetry-service.
    function version() external pure returns (string memory) {
        return "1.0.0-ghost";
    }

    function submissionInterval() external view returns (uint256) {
        return SUBMISSION_INTERVAL;
    }

    function l2BlockTime() external view returns (uint256) {
        return L2_BLOCK_TIME;
    }

    function startingBlockNumber() external view returns (uint256) {
        return STARTING_BLOCK_NUMBER;
    }

    function startingTimestamp() external view returns (uint256) {
        return STARTING_TIMESTAMP;
    }

    function finalizationPeriodSeconds() external view returns (uint256) {
        return FINALIZATION_PERIOD_SECONDS;
    }

    function proposer() external view returns (address) {
        return PROPOSER;
    }

    function challenger() external view returns (address) {
        return CHALLENGER;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Index helpers — ABI-compatible with OP Stack L2OutputOracle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Total stored outputs (next index == length).
    function nextOutputIndex() public view returns (uint256) {
        return _outputs.length;
    }

    /// @notice Index of most recently proposed output (reverts if none exist).
    function latestOutputIndex() external view returns (uint256) {
        require(_outputs.length > 0, "GhostOutputOracle: no outputs yet");
        return _outputs.length - 1;
    }

    /// @notice L2/L3 block number of the most recently proposed output.
    function latestBlockNumber() external view returns (uint256) {
        if (_outputs.length == 0) return STARTING_BLOCK_NUMBER;
        return uint256(_outputs[_outputs.length - 1].l2BlockNumber);
    }

    /// @notice Expected child-chain block number for the next proposal.
    function nextBlockNumber() public view returns (uint256) {
        return STARTING_BLOCK_NUMBER + (nextOutputIndex() * SUBMISSION_INTERVAL);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Output retrieval — ABI-compatible with consensus-telemetry-service
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Return the output proposal at the given index.
    ///         ABI matches `getL2Output(uint256)` used by consensus-telemetry.
    function getL2Output(uint256 _l2OutputIndex)
        external
        view
        returns (OutputProposal memory)
    {
        require(_l2OutputIndex < _outputs.length, "GhostOutputOracle: index oob");
        return _outputs[_l2OutputIndex];
    }

    /// @notice Return the first output at or after `_l2BlockNumber`.
    function getL2OutputIndexAfter(uint256 _l2BlockNumber)
        external
        view
        returns (uint256)
    {
        require(_outputs.length > 0, "GhostOutputOracle: no outputs");
        require(
            _l2BlockNumber <= uint256(_outputs[_outputs.length - 1].l2BlockNumber),
            "GhostOutputOracle: block after latest output"
        );

        uint256 lo = 0;
        uint256 hi = _outputs.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (uint256(_outputs[mid].l2BlockNumber) < _l2BlockNumber) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    /// @notice Check whether the given output is within its finalization window.
    function isFinalized(uint256 _l2OutputIndex) external view returns (bool) {
        require(_l2OutputIndex < _outputs.length, "GhostOutputOracle: index oob");
        return block.timestamp >= uint256(_outputs[_l2OutputIndex].timestamp) + FINALIZATION_PERIOD_SECONDS;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Proposal submission (proposer only)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Submit a new output root for the given child-chain block number.
    ///         ABI-compatible with `proposeL2Output` used by op-proposer.
    ///
    /// @param _outputRoot    Keccak256 of the output commitment.
    /// @param _l2BlockNumber Child-chain block number this root commits to.
    /// @param _l1BlockHash   Parent-chain block hash at submission time
    ///                       (pass bytes32(0) to skip verification).
    /// @param _l1BlockNumber Parent-chain block number for _l1BlockHash.
    function proposeL2Output(
        bytes32 _outputRoot,
        uint256 _l2BlockNumber,
        bytes32 _l1BlockHash,
        uint256 _l1BlockNumber
    ) external {
        if (msg.sender != PROPOSER) revert GhostOracle__NotProposer();
        if (_outputRoot == bytes32(0)) revert GhostOracle__ZeroOutputRoot();

        uint256 expected = nextBlockNumber();
        if (_l2BlockNumber != expected) {
            revert GhostOracle__TooEarlyToPropose(expected, _l2BlockNumber);
        }

        // Optional block hash verification — if caller provides a hash, check it
        if (_l1BlockHash != bytes32(0)) {
            require(
                blockhash(_l1BlockNumber) == _l1BlockHash,
                "GhostOutputOracle: l1 block hash mismatch"
            );
        }

        require(
            block.timestamp >= _computeL2Timestamp(_l2BlockNumber),
            "GhostOutputOracle: block not yet reachable"
        );

        require(block.timestamp <= type(uint128).max, "GhostOutputOracle: timestamp overflow");
        uint128 ts = uint128(block.timestamp);

        require(_l2BlockNumber  <= type(uint128).max, "GhostOutputOracle: block number overflow");
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 bn = uint128(_l2BlockNumber);

        uint256 outputIndex = _outputs.length;
        _outputs.push(OutputProposal({
            outputRoot:    _outputRoot,
            timestamp:     ts,
            l2BlockNumber: bn
        }));

        emit OutputProposed(_outputRoot, outputIndex, _l2BlockNumber, _l1BlockHash, _l1BlockNumber, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deletion (challenger only, within finalization window)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Delete all outputs from `_l2OutputIndex` onward.
    ///         ABI-compatible with `deleteL2Outputs(uint256)` used by op-challenger.
    function deleteL2Outputs(uint256 _l2OutputIndex) external {
        if (msg.sender != CHALLENGER) revert GhostOracle__NotChallenger();
        if (_l2OutputIndex >= _outputs.length) revert GhostOracle__NotEnoughOutputs();

        // Cannot delete already-finalized outputs
        if (block.timestamp >= uint256(_outputs[_l2OutputIndex].timestamp) + FINALIZATION_PERIOD_SECONDS) {
            revert GhostOracle__OutputAlreadyFinalized();
        }

        uint256 prevLength = _outputs.length;
        // Pop all outputs from the end down to _l2OutputIndex
        while (_outputs.length > _l2OutputIndex) {
            _outputs.pop();
        }

        emit OutputsDeleted(prevLength, _outputs.length);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _computeL2Timestamp(uint256 _l2BlockNumber) internal view returns (uint256) {
        require(
            _l2BlockNumber >= STARTING_BLOCK_NUMBER,
            "GhostOutputOracle: block before start"
        );
        return STARTING_TIMESTAMP + (_l2BlockNumber - STARTING_BLOCK_NUMBER) * L2_BLOCK_TIME;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public alias — also expose computeL2Timestamp externally (OP Stack compat)
    // ─────────────────────────────────────────────────────────────────────────

    function computeL2Timestamp(uint256 _l2BlockNumber) external view returns (uint256) {
        return _computeL2Timestamp(_l2BlockNumber);
    }
}
