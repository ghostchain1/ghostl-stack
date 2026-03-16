// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Records AI escalation intents for governance ratification.
contract AIGovernanceEscalation is Governed {
    struct ProposalIntent {
        bytes32 bundleId;
        address target;
        uint256 value;
        bytes data;
        uint16 riskScoreBps;
        uint16 confidenceBps;
        uint64 createdAt;
        address proposer;
    }

    mapping(bytes32 => ProposalIntent) private intents;
    mapping(bytes32 => bool) public intentExists;
    mapping(address => bool) public submitters;
    mapping(uint256 => uint256) public intentsPerEpoch;

    uint16 public riskThresholdBps = 7_500;
    uint16 public confidenceThresholdBps = 7_500;
    uint64 public cooldownSeconds = 30 minutes;
    uint64 public epochLengthSeconds = 1 days;
    uint256 public maxActionsPerEpoch = 5;
    uint64 public lastEscalationAt;
    bool public paused;

    event SubmitterUpdated(address indexed submitter, bool allowed);
    event ThresholdsUpdated(uint16 riskThresholdBps, uint16 confidenceThresholdBps);
    event LimitsUpdated(uint64 cooldownSeconds, uint64 epochLengthSeconds, uint256 maxActionsPerEpoch);
    event EscalationPaused(bool paused);
    event EscalationRejected(
        bytes32 indexed bundleId,
        address indexed submitter,
        uint16 riskScoreBps,
        uint16 confidenceBps,
        bytes32 reason
    );
    event EscalationProposed(
        bytes32 indexed intentId,
        bytes32 indexed bundleId,
        address indexed target,
        uint256 value,
        bytes data
    );

    error NotSubmitter();
    error EscalationPausedError();

    bytes32 private constant REASON_RISK = keccak256("escalation.reason.risk");
    bytes32 private constant REASON_CONFIDENCE = keccak256("escalation.reason.confidence");
    bytes32 private constant REASON_COOLDOWN = keccak256("escalation.reason.cooldown");
    bytes32 private constant REASON_EPOCH_LIMIT = keccak256("escalation.reason.epoch_limit");

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setSubmitter(address submitter, bool allowed) external onlyGovernance {
        submitters[submitter] = allowed;
        emit SubmitterUpdated(submitter, allowed);
    }

    function setThresholds(uint16 riskBps, uint16 confidenceBps) external onlyGovernance {
        require(riskBps <= 10_000, "risk>10000");
        require(confidenceBps <= 10_000, "confidence>10000");
        riskThresholdBps = riskBps;
        confidenceThresholdBps = confidenceBps;
        emit ThresholdsUpdated(riskBps, confidenceBps);
    }

    function setLimits(uint64 cooldownSeconds_, uint64 epochLengthSeconds_, uint256 maxActionsPerEpoch_)
        external
        onlyGovernance
    {
        require(epochLengthSeconds_ > 0, "epoch=0");
        cooldownSeconds = cooldownSeconds_;
        epochLengthSeconds = epochLengthSeconds_;
        maxActionsPerEpoch = maxActionsPerEpoch_;
        emit LimitsUpdated(cooldownSeconds_, epochLengthSeconds_, maxActionsPerEpoch_);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit EscalationPaused(paused_);
    }

    function submitIntent(
        bytes32 bundleId,
        uint16 riskScoreBps,
        uint16 confidenceBps,
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32 intentId, bool accepted) {
        if (!submitters[msg.sender]) revert NotSubmitter();
        if (paused) revert EscalationPausedError();

        if (riskScoreBps < riskThresholdBps) {
            emit EscalationRejected(bundleId, msg.sender, riskScoreBps, confidenceBps, REASON_RISK);
            return (bytes32(0), false);
        }
        if (confidenceBps < confidenceThresholdBps) {
            emit EscalationRejected(bundleId, msg.sender, riskScoreBps, confidenceBps, REASON_CONFIDENCE);
            return (bytes32(0), false);
        }

        uint64 lastAt = lastEscalationAt;
        if (cooldownSeconds != 0 && lastAt != 0 && block.timestamp < lastAt + cooldownSeconds) {
            emit EscalationRejected(bundleId, msg.sender, riskScoreBps, confidenceBps, REASON_COOLDOWN);
            return (bytes32(0), false);
        }

        uint256 epoch = epochLengthSeconds == 0 ? 0 : block.timestamp / epochLengthSeconds;
        if (maxActionsPerEpoch != 0 && intentsPerEpoch[epoch] >= maxActionsPerEpoch) {
            emit EscalationRejected(bundleId, msg.sender, riskScoreBps, confidenceBps, REASON_EPOCH_LIMIT);
            return (bytes32(0), false);
        }

        intentId = keccak256(
            abi.encode(bundleId, target, value, keccak256(data), riskScoreBps, confidenceBps, block.chainid, msg.sender)
        );
        if (!intentExists[intentId]) {
            intents[intentId] = ProposalIntent({
                bundleId: bundleId,
                target: target,
                value: value,
                data: data,
                riskScoreBps: riskScoreBps,
                confidenceBps: confidenceBps,
                createdAt: uint64(block.timestamp),
                proposer: msg.sender
            });
            intentExists[intentId] = true;
        }

        intentsPerEpoch[epoch] += 1;
        lastEscalationAt = uint64(block.timestamp);
        emit EscalationProposed(intentId, bundleId, target, value, data);
        return (intentId, true);
    }

    function getIntent(bytes32 intentId) external view returns (ProposalIntent memory) {
        return intents[intentId];
    }

    function proposalCall(bytes32 intentId) external view returns (address target, uint256 value, bytes memory data) {
        ProposalIntent storage intent = intents[intentId];
        return (intent.target, intent.value, intent.data);
    }
}
