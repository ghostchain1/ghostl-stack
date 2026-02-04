// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal registry that gates automation capabilities/operators behind a governance executor.
/// @dev Designed for custom governance: set `executor` to your ProposalExecutor-like contract.
///      No OZ assumptions. No timelock assumptions.
contract PolicyRegistry {
    // --- Errors ---
    error NotExecutor(address caller);
    error ZeroAddress();

    // --- Events ---
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event PolicyHashUpdated(bytes32 indexed oldHash, bytes32 indexed newHash);
    event CapabilityUpdated(bytes32 indexed capability, bool allowed);
    event OperatorUpdated(address indexed operator, bool allowed);

    // --- Storage ---
    address public executor;            // governance execution authority
    bytes32 public policyHash;          // hash of ratified constitution/PDF/etc

    mapping(bytes32 => bool) private _capAllowed;
    mapping(address => bool) private _operatorAllowed;

    // --- Modifiers ---
    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor(msg.sender);
        _;
    }

    constructor(address initialExecutor, bytes32 initialPolicyHash) {
        if (initialExecutor == address(0)) revert ZeroAddress();
        executor = initialExecutor;
        policyHash = initialPolicyHash;

        emit ExecutorUpdated(address(0), initialExecutor);
        emit PolicyHashUpdated(bytes32(0), initialPolicyHash);
    }

    // --- Views ---
    function isAutomationAllowed(bytes32 capability) external view returns (bool) {
        return _capAllowed[capability];
    }

    function isOperatorAllowed(address operator) external view returns (bool) {
        return _operatorAllowed[operator];
    }

    // --- Governance actions (only executor) ---
    function setExecutor(address newExecutor) external onlyExecutor {
        if (newExecutor == address(0)) revert ZeroAddress();
        address old = executor;
        executor = newExecutor;
        emit ExecutorUpdated(old, newExecutor);
    }

    function setPolicyHash(bytes32 newPolicyHash) external onlyExecutor {
        bytes32 old = policyHash;
        policyHash = newPolicyHash;
        emit PolicyHashUpdated(old, newPolicyHash);
    }

    function setCapability(bytes32 capability, bool allowed) external onlyExecutor {
        _capAllowed[capability] = allowed;
        emit CapabilityUpdated(capability, allowed);
    }

    function setOperator(address operator, bool allowed) external onlyExecutor {
        if (operator == address(0)) revert ZeroAddress();
        _operatorAllowed[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }
}
