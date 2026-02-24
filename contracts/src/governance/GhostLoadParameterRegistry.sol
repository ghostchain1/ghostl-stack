// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GhostLoadParameterRegistry {
    struct PendingUpdate {
        bytes32 key;
        int256 value;
        uint64 executeAfter;
        bool critical;
        bool exists;
    }

    address public owner;
    address public governance;
    uint64 public timelockSeconds;

    mapping(bytes32 => int256) public values;
    mapping(bytes32 => bool) public isCriticalKey;
    mapping(bytes32 => PendingUpdate) public pending;

    event ParameterQueued(bytes32 indexed key, int256 value, bool critical, uint64 executeAfter);
    event ParameterApplied(bytes32 indexed key, int256 value, bool critical);
    event CriticalKeySet(bytes32 indexed key, bool critical);
    event GovernanceChanged(address indexed governance);
    event TimelockChanged(uint64 timelockSeconds);

    error Unauthorized();
    error TimelockActive();
    error MissingPending();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert Unauthorized();
        _;
    }

    constructor(address governance_, uint64 timelockSeconds_) {
        owner = msg.sender;
        governance = governance_;
        timelockSeconds = timelockSeconds_;
    }

    function setGovernance(address governance_) external onlyOwner {
        governance = governance_;
        emit GovernanceChanged(governance_);
    }

    function setTimelock(uint64 timelockSeconds_) external onlyOwner {
        timelockSeconds = timelockSeconds_;
        emit TimelockChanged(timelockSeconds_);
    }

    function setCriticalKey(bytes32 key, bool critical) external onlyOwner {
        isCriticalKey[key] = critical;
        emit CriticalKeySet(key, critical);
    }

    function queueUpdate(bytes32 key, int256 value) external {
        bool critical = isCriticalKey[key];

        if (critical && msg.sender != governance) revert Unauthorized();
        if (!critical && msg.sender != owner && msg.sender != governance) revert Unauthorized();

        uint64 executeAfter = uint64(block.timestamp) + (critical ? timelockSeconds : 0);
        pending[key] =
            PendingUpdate({key: key, value: value, executeAfter: executeAfter, critical: critical, exists: true});
        emit ParameterQueued(key, value, critical, executeAfter);
    }

    function applyUpdate(bytes32 key) external {
        PendingUpdate memory p = pending[key];
        if (!p.exists) revert MissingPending();
        if (block.timestamp < p.executeAfter) revert TimelockActive();

        values[key] = p.value;
        delete pending[key];
        emit ParameterApplied(key, p.value, p.critical);
    }
}
