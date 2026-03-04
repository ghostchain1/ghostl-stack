// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ghost Identity Constitution
/// @notice Constitutional enforcement for sovereign identity branding across GhostStack.
/// @dev Bridges are excluded by policy; do NOT use this to validate external asset naming.
///      Chain IDs: L1=14000101, L2=901, L3=903.
///      Deployer: set GOVERNOR to your DAO / multisig / governor contract.
contract GhostIdentityConstitution {
    // ── Canonical sovereign identity ──────────────────────────────────────────
    string public constant NATIVE_NAME    = "Ghost";
    string public constant NATIVE_SYMBOL  = "GST";
    uint8  public constant NATIVE_DECIMALS = 18;

    // ── Chain-family names (informational anchors) ─────────────────────────────
    string public constant L1_NAME = "GhostChain";
    string public constant L2_NAME = "GhostL2";
    string public constant L3_NAME = "GhostL3";

    // ── Chain IDs ─────────────────────────────────────────────────────────────
    uint256 public constant L1_CHAIN_ID = 14000101;
    uint256 public constant L2_CHAIN_ID = 901;
    uint256 public constant L3_CHAIN_ID = 903;

    // ── Governance ────────────────────────────────────────────────────────────
    address public immutable GOVERNOR;

    // ── Canonical identity commitment ─────────────────────────────────────────
    // Pin this hash in CI, explorers, release notes, and wallet configs to
    // verify that on-chain branding matches the canonical spec.
    bytes32 public constant IDENTITY_HASH = keccak256(
        abi.encodePacked(
            "GhostStackIdentity:v1|",
            "name=Ghost|",
            "symbol=GST|",
            "decimals=18|",
            "L1=GhostChain|",
            "L2=GhostL2|",
            "L3=GhostL3"
        )
    );

    // ── System contract registry (non-bridge) ─────────────────────────────────
    // Keys should be stable: e.g. keccak256("TREASURY"), keccak256("GUARD_POLICY")
    mapping(bytes32 => address) public systemContracts;

    // ── Events ────────────────────────────────────────────────────────────────
    event SystemContractSet(bytes32 indexed key, address indexed addr);
    event IdentityVerified(bytes32 identityHash, string name, string symbol, uint8 decimals);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotGovernor();
    error InvalidIdentity(string what);
    error ZeroAddress();

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyGovernor() {
        if (msg.sender != GOVERNOR) revert NotGovernor();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address governor) {
        if (governor == address(0)) revert ZeroAddress();
        GOVERNOR = governor;
        emit IdentityVerified(IDENTITY_HASH, NATIVE_NAME, NATIVE_SYMBOL, NATIVE_DECIMALS);
    }

    // ── System contract registry ──────────────────────────────────────────────

    /// @notice Register a system contract (non-bridge).
    /// @param key   Stable key, e.g. keccak256("TREASURY") or keccak256("GUARD_POLICY").
    /// @param addr  Contract address to register.
    function setSystemContract(bytes32 key, address addr) external onlyGovernor {
        if (addr == address(0)) revert ZeroAddress();
        systemContracts[key] = addr;
        emit SystemContractSet(key, addr);
    }

    // ── Identity checks ───────────────────────────────────────────────────────

    /// @notice Stateless identity check — for off-chain tooling and integration tests.
    /// @return true if all three fields match the canonical constitution.
    function verifyIdentity(
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external pure returns (bool) {
        if (keccak256(bytes(name))   != keccak256(bytes(NATIVE_NAME)))   return false;
        if (keccak256(bytes(symbol)) != keccak256(bytes(NATIVE_SYMBOL))) return false;
        if (decimals != NATIVE_DECIMALS) return false;
        return true;
    }

    /// @notice Revert if the provided identity does not match the constitution.
    ///         Use in contract constructors or initializers that must be branded correctly.
    function requireIdentity(
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external pure {
        if (keccak256(bytes(name))   != keccak256(bytes(NATIVE_NAME)))   revert InvalidIdentity("name");
        if (keccak256(bytes(symbol)) != keccak256(bytes(NATIVE_SYMBOL))) revert InvalidIdentity("symbol");
        if (decimals != NATIVE_DECIMALS) revert InvalidIdentity("decimals");
    }

    /// @notice Returns the expected identity hash for cross-stack pinning.
    ///         Cast: cast call <addr> "getIdentityHash()" should match the value
    ///         stored in release notes, CI env, and wallet metadata.
    function getIdentityHash() external pure returns (bytes32) {
        return IDENTITY_HASH;
    }
}
