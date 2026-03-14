// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/GhostHash.sol";

/// @notice Minimal timelock controller (delay + schedule/execute) suitable for gating
///         a production launch authorization. GhostChain-native implementation.
contract GhostTimelockController {
    error Unauthorized();
    error NotScheduled();
    error NotReady(uint256 readyAt);
    error AlreadyExecuted();

    address public admin;
    uint64 public minDelaySeconds;

    mapping(address => bool) public proposers;
    mapping(address => bool) public executors;

    mapping(bytes32 => uint256) public readyAt; // 0 => not scheduled, 1 => executed, >=2 => timestamp

    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event ProposerSet(address indexed account, bool allowed);
    event ExecutorSet(address indexed account, bool allowed);
    event MinDelaySet(uint64 previousDelaySeconds, uint64 newDelaySeconds);
    event Scheduled(bytes32 indexed operationId, address indexed target, uint256 value, uint256 readyAt);
    event Executed(bytes32 indexed operationId, address indexed target, uint256 value);
    event Canceled(bytes32 indexed operationId);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyProposer() {
        if (!proposers[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyExecutor() {
        if (!executors[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(uint64 minDelaySeconds_, address admin_) {
        minDelaySeconds = minDelaySeconds_;
        admin = admin_ == address(0) ? msg.sender : admin_;
        proposers[admin] = true;
        executors[admin] = true;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "zero_admin");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setMinDelaySeconds(uint64 newDelaySeconds) external onlyAdmin {
        emit MinDelaySet(minDelaySeconds, newDelaySeconds);
        minDelaySeconds = newDelaySeconds;
    }

    function setProposer(address account, bool allowed) external onlyAdmin {
        proposers[account] = allowed;
        emit ProposerSet(account, allowed);
    }

    function setExecutor(address account, bool allowed) external onlyAdmin {
        executors[account] = allowed;
        emit ExecutorSet(account, allowed);
    }

    function hashOperation(address target, uint256 value, bytes calldata data, bytes32 salt) public pure returns (bytes32) {
        return GhostHash.timelockOpId(target, value, keccak256(data), salt);
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt) external onlyProposer returns (bytes32 opId) {
        opId = hashOperation(target, value, data, salt);
        require(readyAt[opId] == 0, "already_scheduled");
        uint256 eta = block.timestamp + minDelaySeconds;
        readyAt[opId] = eta;
        emit Scheduled(opId, target, value, eta);
    }

    function cancel(bytes32 opId) external onlyAdmin {
        uint256 current = readyAt[opId];
        if (current == 0) revert NotScheduled();
        if (current == 1) revert AlreadyExecuted();
        delete readyAt[opId];
        emit Canceled(opId);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        payable
        onlyExecutor
        returns (bytes memory returndata)
    {
        bytes32 opId = hashOperation(target, value, data, salt);
        uint256 eta = readyAt[opId];
        if (eta == 0) revert NotScheduled();
        if (eta == 1) revert AlreadyExecuted();
        if (block.timestamp < eta) revert NotReady(eta);

        readyAt[opId] = 1;
        emit Executed(opId, target, value);

        (bool ok, bytes memory out) = target.call{value: value}(data);
        require(ok, "call_failed");
        return out;
    }
}

