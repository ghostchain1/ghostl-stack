// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostContractRegistry
/// @notice Tracks on-chain deployments across L1/L2/L3 with strict routing-law enforcement.
/// @dev    ROUTING LAW (HARD INVARIANT):
///           L3 interacts only with L2.
///           L2 interacts only with L1.
///           No direct L3→L1 links are permitted.
///         Chain IDs are used as the canonical layer identifier.
///         Layer adjacency: L3_CHAIN_ID → L2_CHAIN_ID → L1_CHAIN_ID (root).
contract GhostContractRegistry {
    // ──────────────────────────────────────────────────────────────────────
    // ROLES
    // ──────────────────────────────────────────────────────────────────────
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant REGISTRAR_ROLE     = keccak256("REGISTRAR_ROLE");
    bytes32 public constant AUDITOR_ROLE       = keccak256("AUDITOR_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ──────────────────────────────────────────────────────────────────────
    // LAYER / CHAIN TOPOLOGY
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Canonical layer identifier (1=L1, 2=L2, 3=L3).
    mapping(uint256 chainId => uint8 layer) public chainLayer;

    /// @notice Legal parent chain for each layer (routing law).
    ///         L3 parent = L2_chainId; L2 parent = L1_chainId; L1 parent = 0.
    mapping(uint8 layer => uint256 parentChainId) public layerParent;

    uint256 public l1ChainId;
    uint256 public l2ChainId;
    uint256 public l3ChainId;

    // ──────────────────────────────────────────────────────────────────────
    // DEPLOYMENT RECORD
    // ──────────────────────────────────────────────────────────────────────

    struct Deployment {
        address  contractAddress;
        uint256  chainId;
        string   name;
        string   version;
        bytes32  gitCommit;          // short commit hash
        bytes32  bytecodeHash;       // keccak256(deployedBytecode)
        bytes32  abiHash;            // keccak256(abi)
        string   buildProfile;       // e.g. "default" | "legacy"
        bool     active;
        uint256  deployedAt;         // block.timestamp
        address  deployer;
        uint256  deployedBlock;
    }

    /// key: keccak256(abi.encode(chainId, contractAddress))
    mapping(bytes32 => Deployment) public deployments;
    bytes32[] public deploymentKeys;

    // ──────────────────────────────────────────────────────────────────────
    // ROUTING LAW LINK RECORD
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Records which upstream chain a deployed contract is authorized to call.
    ///         Enforces: L3 contract may only register a link to an L2 contract.
    ///                   L2 contract may only register a link to an L1 contract.
    struct ChainLink {
        uint256 fromChainId;
        address fromContract;
        uint256 toChainId;
        address toContract;
    }

    ChainLink[] public chainLinks;

    // ──────────────────────────────────────────────────────────────────────
    // EVENTS
    // ──────────────────────────────────────────────────────────────────────

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event DeploymentRegistered(
        bytes32 indexed key,
        address indexed contractAddress,
        uint256 indexed chainId,
        string name,
        string version,
        bytes32 bytecodeHash
    );
    event DeploymentDeactivated(bytes32 indexed key);
    event ChainLinkRegistered(
        uint256 indexed fromChainId,
        address indexed fromContract,
        uint256 toChainId,
        address toContract
    );
    event ChainTopologySet(uint256 l1, uint256 l2, uint256 l3);

    // ──────────────────────────────────────────────────────────────────────
    // ERRORS
    // ──────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error AlreadyRegistered();
    error UnknownChain(uint256 chainId);
    error RoutingLawViolation(uint256 fromChain, uint256 toChain, string reason);
    error ZeroAddress();
    error TopologyNotSet();

    // ──────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ──────────────────────────────────────────────────────────────────────

    constructor(
        address admin,
        uint256 _l1ChainId,
        uint256 _l2ChainId,
        uint256 _l3ChainId
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);
        _setChainTopology(_l1ChainId, _l2ChainId, _l3ChainId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // ROLE MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    // ──────────────────────────────────────────────────────────────────────
    // TOPOLOGY
    // ──────────────────────────────────────────────────────────────────────

    function setChainTopology(
        uint256 _l1ChainId,
        uint256 _l2ChainId,
        uint256 _l3ChainId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setChainTopology(_l1ChainId, _l2ChainId, _l3ChainId);
    }

    function _setChainTopology(
        uint256 _l1ChainId,
        uint256 _l2ChainId,
        uint256 _l3ChainId
    ) internal {
        l1ChainId = _l1ChainId;
        l2ChainId = _l2ChainId;
        l3ChainId = _l3ChainId;

        chainLayer[_l1ChainId] = 1;
        chainLayer[_l2ChainId] = 2;
        chainLayer[_l3ChainId] = 3;

        // Routing law: L3→L2→L1 only
        layerParent[3] = _l2ChainId;
        layerParent[2] = _l1ChainId;
        layerParent[1] = 0; // root — no parent

        emit ChainTopologySet(_l1ChainId, _l2ChainId, _l3ChainId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // DEPLOYMENT REGISTRATION
    // ──────────────────────────────────────────────────────────────────────

    function register(
        address contractAddress,
        uint256 targetChainId,
        string calldata name,
        string calldata version,
        bytes32 gitCommit,
        bytes32 bytecodeHash,
        bytes32 abiHash,
        string calldata buildProfile
    ) external onlyRole(REGISTRAR_ROLE) returns (bytes32 key) {
        if (contractAddress == address(0)) revert ZeroAddress();
        if (chainLayer[targetChainId] == 0) revert UnknownChain(targetChainId);

        key = _deploymentKey(targetChainId, contractAddress);
        Deployment storage d = deployments[key];
        if (d.active) revert AlreadyRegistered();

        deployments[key] = Deployment({
            contractAddress: contractAddress,
            chainId:         targetChainId,
            name:            name,
            version:         version,
            gitCommit:       gitCommit,
            bytecodeHash:    bytecodeHash,
            abiHash:         abiHash,
            buildProfile:    buildProfile,
            active:          true,
            deployedAt:      block.timestamp,
            deployer:        msg.sender,
            deployedBlock:   block.number
        });
        deploymentKeys.push(key);

        emit DeploymentRegistered(key, contractAddress, targetChainId, name, version, bytecodeHash);
    }

    function deactivate(bytes32 key) external onlyRole(REGISTRAR_ROLE) {
        deployments[key].active = false;
        emit DeploymentDeactivated(key);
    }

    // ──────────────────────────────────────────────────────────────────────
    // ROUTING LAW: CHAIN LINK REGISTRATION
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Register a cross-chain link, enforcing the routing law.
    ///         Only L3→L2 and L2→L1 links are legal.
    function registerChainLink(
        uint256 fromChainId,
        address fromContract,
        uint256 toChainId,
        address toContract
    ) external onlyRole(REGISTRAR_ROLE) {
        _enforceRoutingLaw(fromChainId, toChainId);

        chainLinks.push(ChainLink({
            fromChainId: fromChainId,
            fromContract: fromContract,
            toChainId: toChainId,
            toContract: toContract
        }));

        emit ChainLinkRegistered(fromChainId, fromContract, toChainId, toContract);
    }

    /// @notice Pure routing law check — reverts on violation.
    function assertRoutingLaw(uint256 fromChainId, uint256 toChainId) external view {
        _enforceRoutingLaw(fromChainId, toChainId);
    }

    function _enforceRoutingLaw(uint256 fromChainId, uint256 toChainId) internal view {
        if (l1ChainId == 0) revert TopologyNotSet();

        uint8 fromLayer = chainLayer[fromChainId];
        uint8 toLayer   = chainLayer[toChainId];

        if (fromLayer == 0) revert UnknownChain(fromChainId);
        if (toLayer   == 0) revert UnknownChain(toChainId);

        // L3 may only link to L2 (its parent)
        if (fromLayer == 3 && toLayer != 2)
            revert RoutingLawViolation(fromChainId, toChainId, "L3_MUST_LINK_TO_L2_ONLY");

        // L2 may only link to L1 (its parent)
        if (fromLayer == 2 && toLayer != 1)
            revert RoutingLawViolation(fromChainId, toChainId, "L2_MUST_LINK_TO_L1_ONLY");

        // L1 may not be the source of a downward call through this registry
        if (fromLayer == 1)
            revert RoutingLawViolation(fromChainId, toChainId, "L1_IS_ROOT_NO_OUTBOUND_LINKS");
    }

    // ──────────────────────────────────────────────────────────────────────
    // VIEWS
    // ──────────────────────────────────────────────────────────────────────

    function getDeployment(bytes32 key) external view returns (Deployment memory) {
        return deployments[key];
    }

    function deploymentCount() external view returns (uint256) {
        return deploymentKeys.length;
    }

    function getDeploymentByIndex(uint256 i) external view returns (Deployment memory) {
        return deployments[deploymentKeys[i]];
    }

    function chainLinkCount() external view returns (uint256) {
        return chainLinks.length;
    }

    // ──────────────────────────────────────────────────────────────────────
    // INTERNAL
    // ──────────────────────────────────────────────────────────────────────

    function _deploymentKey(uint256 chainId, address addr) internal pure returns (bytes32) {
        return keccak256(abi.encode(chainId, addr));
    }
}
