// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/GhostHash.sol";

/// @notice Flexible timelock supporting per-operation delays and batched actions.
contract GhostChainTimelock {
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant SCHEDULER_ROLE = keccak256("SCHEDULER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    mapping(bytes32 => uint256) public timestamps; // opId => executeAfter

    event RoleSet(bytes32 indexed role, address indexed account, bool allowed);
    event Scheduled(bytes32 indexed opId, bytes32 indexed salt, uint256 executeAfter);
    event Executed(bytes32 indexed opId, bytes32 indexed salt);

    error Unauthorized();
    error AlreadyScheduled();
    error NotScheduled();
    error NotReady();
    error CallFailed();

    constructor(address admin) {
        _setRole(DEFAULT_ADMIN_ROLE, admin, true);
        _setRole(SCHEDULER_ROLE, admin, true);
        _setRole(EXECUTOR_ROLE, admin, true);
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function setRole(bytes32 role, address account, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRole(role, account, allowed);
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt, uint256 delay)
        external
        onlyRole(SCHEDULER_ROLE)
        returns (bytes32 opId)
    {
        require(value == 0, "value");
        opId = GhostHash.timelockOpId(target, value, keccak256(data), salt);
        if (timestamps[opId] != 0) revert AlreadyScheduled();
        uint256 executeAfter = block.timestamp + delay;
        timestamps[opId] = executeAfter;
        emit Scheduled(opId, salt, executeAfter);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        public
        onlyRole(EXECUTOR_ROLE)
        returns (bytes memory result)
    {
        require(value == 0, "value");
        bytes32 opId = GhostHash.timelockOpId(target, value, keccak256(data), salt);
        uint256 ts = timestamps[opId];
        if (ts == 0) revert NotScheduled();
        if (block.timestamp < ts) revert NotReady();
        timestamps[opId] = 0;

        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert CallFailed();
        emit Executed(opId, salt);
        return ret;
    }

    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas, bytes32 salt)
        public
        onlyRole(EXECUTOR_ROLE)
        returns (bytes[] memory results)
    {
        require(targets.length == values.length && targets.length == datas.length, "batch length mismatch");
        results = new bytes[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            results[i] = execute(targets[i], values[i], datas[i], salt);
        }
    }

    function _setRole(bytes32 role, address account, bool allowed) internal {
        require(account != address(0), "account=0");
        _roles[role][account] = allowed;
        emit RoleSet(role, account, allowed);
    }
}
