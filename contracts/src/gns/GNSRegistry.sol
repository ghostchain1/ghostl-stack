// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/GhostHash.sol";

// ────────────────────────────────────────────────────────────────────────────
// GNSRegistry — Ghost Name Service, L1 Canonical Root Registry
//
// Routing law:
//   L3 ↔ L2 only  │  L2 ↔ L1 only  │  L1 is canonical root of identity
//
// All names are stored as keccak256 namehash (GNS/ENS-compatible). // brand-enforcer-ignore
// The root label "ghost" is constitutionally locked and can never be
// re-registered or reassigned.
// ────────────────────────────────────────────────────────────────────────────

/// @notice Namehash helpers (GNS namehash — ENS-compatible) // brand-enforcer-ignore
library GNSLib {
    bytes32 internal constant ROOT_NODE = bytes32(0);

    /// @dev keccak256(parent ++ keccak256(label))
    function namehash(bytes32 parent, string memory label) internal pure returns (bytes32) {
        return GhostHash.gnsNodeFromLabel(parent, label);
    }

    function labelHash(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }
}

contract GNSRegistry {
    using GNSLib for bytes32;

    // ── Types ────────────────────────────────────────────────────────────────
    struct Record {
        address owner;
        address resolver;
        address approved;
        uint64  expiry;          // unix seconds; 0 = permanent (root-level only)
        bool    locked;          // governance-locked: cannot be transferred
    }

    // ── Storage ──────────────────────────────────────────────────────────────
    mapping(bytes32 => Record) public records;

    /// node → (operator → approved-for-all)
    mapping(bytes32 => mapping(address => bool)) public operators;

    address public governance;   // Ghost Constitution / governance address
    address public l2Bridge;     // authorised L2 aggregator relayer
    address public guardian;     // authorised anomaly-freeze caller (GNSConstitutionGuard)

    // ── Reserved namespaces (constitutionally locked) ─────────────────────
    //   "ghost" root  •  "validator"  •  "dao"  •  "treasury"
    mapping(bytes32 => bool) public reserved;

    // ── Events ───────────────────────────────────────────────────────────────
    event NameRegistered(bytes32 indexed node, string label, address owner, uint64 expiry);
    event NameRenewed(bytes32 indexed node, uint64 newExpiry);
    event ResolverSet(bytes32 indexed node, address resolver);
    event OwnershipTransferred(bytes32 indexed node, address newOwner);
    event ApprovalSet(bytes32 indexed node, address operator, bool approved);
    event NameLocked(bytes32 indexed node);
    event GovernanceChanged(address newGovernance);
    event L2BridgeSet(address bridge);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotOwnerOrApproved();
    error AlreadyRegistered();
    error NameExpired();
    error RootLocked();
    error Locked();
    error NotGovernance();
    error NotBridge();
    error InvalidDuration();

    // ── Constants ─────────────────────────────────────────────────────────────
    uint64 public constant MIN_DURATION = 365 days;
    uint64 public constant MAX_DURATION = 10 * 365 days;

    bytes32 public immutable GHOST_ROOT;   // namehash of "ghost"

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _governance) {
        governance = _governance;

        // Compute "ghost" root namehash
        GHOST_ROOT = GNSLib.namehash(GNSLib.ROOT_NODE, "ghost");

        // Constitutionally lock root — permanent, owned by governance
        records[GHOST_ROOT] = Record({
            owner:    _governance,
            resolver: address(0),
            approved: address(0),
            expiry:   0,
            locked:   true
        });

        // Seed reserved sub-namespaces under .ghost
        _reserve("validator");
        _reserve("dao");
        _reserve("treasury");
        _reserve("core");

        emit NameRegistered(GHOST_ROOT, "ghost", _governance, 0);
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    modifier onlyBridgeOrGovernance() {
        if (msg.sender != l2Bridge && msg.sender != governance) revert NotBridge();
        _;
    }

    modifier ownerOrApproved(bytes32 node) {
        Record storage r = records[node];
        if (
            r.owner != msg.sender &&
            r.approved != msg.sender &&
            !operators[node][msg.sender]
        ) revert NotOwnerOrApproved();
        _;
    }

    // ── Registration (direct L1) ──────────────────────────────────────────────
    /// @notice Register a second-level name under .ghost (e.g. "vitalik.ghost")
    /// @param label   Plaintext label (e.g. "vitalik")
    /// @param owner_  Address that will own the name
    /// @param duration Registration period in seconds (min 1 year, max 10 years)
    function register(
        string calldata label,
        address owner_,
        uint64 duration
    ) external returns (bytes32 node) {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();

        node = GNSLib.namehash(GHOST_ROOT, label);

        // Guard: constitutionally reserved namespaces
        if (reserved[GNSLib.labelHash(label)]) revert RootLocked();

        Record storage r = records[node];
        if (r.expiry != 0 && r.expiry > block.timestamp) revert AlreadyRegistered();

        records[node] = Record({
            owner:    owner_,
            resolver: address(0),
            approved: address(0),
            expiry:   uint64(block.timestamp) + duration,
            locked:   false
        });

        emit NameRegistered(node, label, owner_, uint64(block.timestamp) + duration);
    }

    /// @notice Bridge-relayed registration (called by L2Aggregator via bridge)
    function bridgeRegister(
        bytes32 node,
        string calldata label,
        address owner_,
        uint64 expiry_
    ) external onlyBridgeOrGovernance {
        if (reserved[GNSLib.labelHash(label)]) revert RootLocked();

        Record storage r = records[node];
        if (r.expiry != 0 && r.expiry > block.timestamp) revert AlreadyRegistered();

        records[node] = Record({
            owner:    owner_,
            resolver: address(0),
            approved: address(0),
            expiry:   expiry_,
            locked:   false
        });

        emit NameRegistered(node, label, owner_, expiry_);
    }

    // ── Renewal ───────────────────────────────────────────────────────────────
    function renew(bytes32 node, uint64 duration) external ownerOrApproved(node) {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();
        Record storage r = records[node];
        if (r.locked) revert Locked();
        uint64 base = r.expiry > uint64(block.timestamp) ? r.expiry : uint64(block.timestamp);
        r.expiry = base + duration;
        emit NameRenewed(node, r.expiry);
    }

    // ── Resolver ──────────────────────────────────────────────────────────────
    function setResolver(bytes32 node, address resolver_) external ownerOrApproved(node) {
        _assertNotExpired(node);
        records[node].resolver = resolver_;
        emit ResolverSet(node, resolver_);
    }

    // ── Transfer ──────────────────────────────────────────────────────────────
    function transfer(bytes32 node, address newOwner) external ownerOrApproved(node) {
        Record storage r = records[node];
        if (r.locked) revert Locked();
        _assertNotExpired(node);
        r.owner    = newOwner;
        r.approved = address(0);
        emit OwnershipTransferred(node, newOwner);
    }

    // ── Approval ──────────────────────────────────────────────────────────────
    function setApproval(bytes32 node, address operator, bool approved)
        external
        ownerOrApproved(node)
    {
        operators[node][operator] = approved;
        records[node].approved = approved ? operator : address(0);
        emit ApprovalSet(node, operator, approved);
    }

    // ── Governance ────────────────────────────────────────────────────────────
    function lockName(bytes32 node) external {
        if (msg.sender != governance && msg.sender != guardian) revert NotGovernance();
        records[node].locked = true;
        emit NameLocked(node);
    }

    function setGovernance(address newGovernance) external onlyGovernance {
        governance = newGovernance;
        emit GovernanceChanged(newGovernance);
    }

    function setGuardian(address _guardian) external onlyGovernance {
        guardian = _guardian;
    }

    function setL2Bridge(address bridge) external onlyGovernance {
        l2Bridge = bridge;
        emit L2BridgeSet(bridge);
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function resolver(bytes32 node) external view returns (address) {
        return records[node].resolver;
    }

    function owner(bytes32 node) external view returns (address) {
        return records[node].owner;
    }

    function expiry(bytes32 node) external view returns (uint64) {
        return records[node].expiry;
    }

    function isExpired(bytes32 node) public view returns (bool) {
        uint64 exp = records[node].expiry;
        return exp != 0 && exp < block.timestamp;
    }

    function isAvailable(bytes32 node) external view returns (bool) {
        uint64 exp = records[node].expiry;
        return exp == 0 || exp < block.timestamp;
    }

    /// @notice Compute the namehash for label under .ghost root
    function nodeOf(string calldata label) external view returns (bytes32) {
        return GNSLib.namehash(GHOST_ROOT, label);
    }

    // ── Internal ──────────────────────────────────────────────────────────────
    function _assertNotExpired(bytes32 node) internal view {
        if (isExpired(node)) revert NameExpired();
    }

    function _reserve(string memory label) internal {
        bytes32 lh   = GNSLib.labelHash(label);
        bytes32 node = GhostHash.gnsNode(GHOST_ROOT, lh);
        reserved[lh] = true;
        records[node] = Record({
            owner:    governance,
            resolver: address(0),
            approved: address(0),
            expiry:   0,
            locked:   true
        });
    }
}
