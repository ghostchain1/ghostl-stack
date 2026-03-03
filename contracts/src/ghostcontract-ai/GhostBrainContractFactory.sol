// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          GhostChain · GhostBrain AI Contract Evolution System           ║
// ║  Self-learning · Self-evolving · Autonomous · GhostStack v2             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import "./GhostBrainEvolutionLedger.sol";

/// @title  GhostBrainContractFactory
/// @notice Deploys branded GhostChain contracts using EIP-1167 minimal proxy
///         clones.  Every deployment is logged to GhostBrainEvolutionLedger
///         so the autonomous evolution history is fully auditable.
///
///         Routing law:
///           The factory lives on the chain it deploys to (L1, L2, or L3).
///           Cross-layer deployment is NOT permitted from this contract.
///           The AI orchestrator must call the factory on the correct chain.
///
///         Brand requirement:
///           All implementations registered via `registerImplementation` must
///           pass the brand-check selector (bytes4 0x5c7d6b24 ≙ ghostBrand()).
///           Bridge contracts are exempt from branding.
contract GhostBrainContractFactory {

    // ─── Roles ────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ─── Types ────────────────────────────────────────────────────────────

    enum ContractKind {
        GOVERNANCE,
        TREASURY,
        ATTESTATION,
        LIQUIDITY,
        ORACLE,
        COMPLIANCE,
        AI_GUARD,
        BRIDGE,       // exempt from branding
        OTHER
    }

    struct Implementation {
        address  impl;
        ContractKind kind;
        bytes32  bytecodeHash;
        bytes32  label;
        bool     active;
        bool     requiresBrand;
        uint256  registeredAt;
        address  registeredBy;
    }

    struct Deployment {
        address  proxy;
        bytes32  implLabel;
        ContractKind kind;
        bytes    initCalldata;
        uint256  deployedAt;
        address  deployer;
        uint64   ledgerRecordId;
    }

    /// @dev label → implementation
    mapping(bytes32 => Implementation) public implementations;
    bytes32[] public implLabels;

    /// @dev proxy address → deployment record
    mapping(address => Deployment) public deployments;
    address[] public allProxies;

    GhostBrainEvolutionLedger public ledger;

    // Ghost brand selector: bytes4(keccak256("ghostBrand()"))
    bytes4 private constant BRAND_SELECTOR = 0x5c7d6b24;

    // ─── Events ───────────────────────────────────────────────────────────

    event ImplementationRegistered(bytes32 indexed label, address impl, ContractKind kind);
    event ContractDeployed(address indexed proxy, bytes32 indexed implLabel, ContractKind kind, uint64 ledgerRecordId);
    event ImplementationDeactivated(bytes32 indexed label);

    // ─── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ImplNotFound(bytes32 label);
    error ImplNotActive(bytes32 label);
    error ImplAlreadyRegistered(bytes32 label);
    error BrandCheckFailed(address impl);
    error DeployFailed();
    error InitFailed();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address admin_, GhostBrainEvolutionLedger ledger_) {
        _grantRole(ADMIN_ROLE,   admin_);
        _grantRole(FACTORY_ROLE, admin_);
        ledger = ledger_;
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

    // ─── Implementation registry ──────────────────────────────────────────

    /// @notice Register an implementation address under a label.
    /// @param label          Unique human-readable key (bytes32).
    /// @param impl           Implementation contract address.
    /// @param kind           Contract category.
    /// @param bytecodeHash   keccak256 of the implementation's deployed bytecode.
    /// @param requiresBrand  If true, impl must expose ghostBrand() (skip for bridges).
    function registerImplementation(
        bytes32     label,
        address     impl,
        ContractKind kind,
        bytes32     bytecodeHash,
        bool        requiresBrand
    ) external onlyRole(ADMIN_ROLE) {
        if (implementations[label].impl != address(0)) revert ImplAlreadyRegistered(label);
        if (requiresBrand) _checkBrand(impl);

        implementations[label] = Implementation({
            impl:          impl,
            kind:          kind,
            bytecodeHash:  bytecodeHash,
            label:         label,
            active:        true,
            requiresBrand: requiresBrand,
            registeredAt:  block.timestamp,
            registeredBy:  msg.sender
        });
        implLabels.push(label);

        emit ImplementationRegistered(label, impl, kind);
    }

    function deactivateImplementation(bytes32 label) external onlyRole(ADMIN_ROLE) {
        implementations[label].active = false;
        emit ImplementationDeactivated(label);
    }

    // ─── Core: deploy ─────────────────────────────────────────────────────

    /// @notice Deploy a new clone of a registered implementation.
    /// @param label         Implementation label to clone.
    /// @param initCalldata  Optional init calldata (forwarded to proxy after deploy).
    /// @param salt          CREATE2 salt for deterministic addressing.
    /// @param ledgerNote    Short label for the evolution ledger entry.
    function deploy(
        bytes32      label,
        bytes calldata initCalldata,
        bytes32      salt,
        bytes32      ledgerNote
    ) external onlyRole(FACTORY_ROLE) returns (address proxy) {
        Implementation storage imp = implementations[label];
        if (imp.impl == address(0)) revert ImplNotFound(label);
        if (!imp.active)            revert ImplNotActive(label);

        proxy = _cloneDeterministic(imp.impl, salt);
        if (proxy == address(0)) revert DeployFailed();

        if (initCalldata.length > 0) {
            (bool ok,) = proxy.call(initCalldata);
            if (!ok) revert InitFailed();
        }

        uint64 ledgerId = _logToLedger(
            GhostBrainEvolutionLedger.EvolutionKind.CONTRACT_CREATED,
            proxy,
            imp.bytecodeHash,
            ledgerNote
        );

        deployments[proxy] = Deployment({
            proxy:        proxy,
            implLabel:    label,
            kind:         imp.kind,
            initCalldata: initCalldata,
            deployedAt:   block.timestamp,
            deployer:     msg.sender,
            ledgerRecordId: ledgerId
        });
        allProxies.push(proxy);

        emit ContractDeployed(proxy, label, imp.kind, ledgerId);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function totalDeployments() external view returns (uint256) {
        return allProxies.length;
    }

    function totalImplementations() external view returns (uint256) {
        return implLabels.length;
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    /// @dev EIP-1167 minimal proxy clone with CREATE2.
    function _cloneDeterministic(address impl, bytes32 salt) internal returns (address instance) {
        assembly {
            // Load free-memory pointer
            let ptr := mload(0x40)

            // EIP-1167 creation code (55 bytes):
            // 3d602d80600a3d3981f3363d3d373d3d3d363d73<impl>5af43d82803e903d91602b57fd5bf3
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)

            instance := create2(0, ptr, 0x37, salt)
        }
    }

    function _checkBrand(address impl) internal view {
        (bool ok,) = impl.staticcall(abi.encodeWithSelector(BRAND_SELECTOR));
        if (!ok) revert BrandCheckFailed(impl);
    }

    function _logToLedger(
        GhostBrainEvolutionLedger.EvolutionKind kind,
        address target,
        bytes32 artifactHash,
        bytes32 label
    ) internal returns (uint64) {
        try ledger.record(
            kind,
            target,
            block.chainid,
            artifactHash,
            bytes32(0),
            "",
            9_000,   // 90% confidence for AI-created contracts
            label
        ) returns (uint64 id) {
            return id;
        } catch {
            return 0; // ledger unavailable — deployment still proceeds
        }
    }

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
    }
}
