// GhostChain Contracts v5.6.1 (gid/contracts/UsernameResolver.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title UsernameResolver
 * @notice Fast forward and reverse username → wallet resolver for the
 *         GhostChain Sovereign Identity Network.
 *
 * Resolution model:
 *   Forward:  username hash → wallet address
 *   Reverse:  wallet address → canonical username string
 *   Layer-aware: a wallet may have different addresses registered per
 *                layer (L1/L2/L3); forward resolution returns the L1 address
 *                by default; callers may request a specific layer.
 *
 * Access control:
 *   Only authorised registrars (including GhostIdentityRegistry) may call
 *   `set()` or `remove()`.  Read functions are open.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 *
 * Integration:
 *   GhostIdentityRegistry calls `set(username, wallet)` after each successful
 *   registration and `remove(username)` on deactivation.
 *   Off-chain GID Resolver Service mirrors this contract for low-latency reads.
 *
 * Security:
 *   - Reading is always free and unrestricted.
 *   - Writes restricted to allowlisted registrars.
 *   - Layer chain IDs validated against the GhostChain canonical set.
 */
contract UsernameResolver {
    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;
    uint256 internal constant L2_CHAIN_ID = 901;
    uint256 internal constant L3_CHAIN_ID = 903;

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;

    /// @notice Authorised registrar addresses (GhostIdentityRegistry, etc.).
    mapping(address => bool) public registrars;

    /// @notice Forward resolution: keccak256(username) → wallet (L1 default).
    mapping(bytes32 => address) private _forward;

    /// @notice Forward resolution per layer: keccak256(username) → chainId → wallet.
    mapping(bytes32 => mapping(uint256 => address)) private _forwardByLayer;

    /// @notice Reverse resolution: wallet → canonical username.
    mapping(address => string) private _reverse;

    /// @notice Canonical username string per key (for enumeration).
    mapping(bytes32 => string) private _usernameByKey;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EntrySet(bytes32 indexed key, string username, address indexed wallet, uint256 chainId);
    event EntryRemoved(bytes32 indexed key, string username, address indexed wallet);
    event RegistrarAdded(address indexed registrar);
    event RegistrarRemoved(address indexed registrar);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotRegistrar();
    error ZeroAddress();
    error InvalidChainId();
    error EmptyUsername();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    modifier onlyRegistrar() {
        _onlyRegistrar();
        _;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    function _onlyRegistrar() internal view {
        if (!registrars[msg.sender]) revert NotRegistrar();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
        // Admin is the initial registrar so GhostIdentityRegistry can be added later.
        registrars[msg.sender] = true;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function addRegistrar(address r) external onlyAdmin {
        if (r == address(0)) revert ZeroAddress();
        registrars[r] = true;
        emit RegistrarAdded(r);
    }

    function removeRegistrar(address r) external onlyAdmin {
        registrars[r] = false;
        emit RegistrarRemoved(r);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ─── Writes (registrar-restricted) ───────────────────────────────────────

    /**
     * @notice Set or update a username → wallet mapping for a specific layer.
     * @param username  Canonical GID username.
     * @param wallet    Wallet address on `chainId`.
     * @param chainId   GhostChain layer (14000101, 901, or 903).
     */
    function setForLayer(string calldata username, address wallet, uint256 chainId)
        external onlyRegistrar
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (bytes(username).length == 0) revert EmptyUsername();
        _validateChainId(chainId);

        bytes32 key = keccak256(bytes(username));
        _forwardByLayer[key][chainId] = wallet;
        _usernameByKey[key] = username;

        // Default L1 entry is the primary.
        if (chainId == L1_CHAIN_ID) {
            _forward[key]          = wallet;
            _reverse[wallet]       = username;
        }

        emit EntrySet(key, username, wallet, chainId);
    }

    /**
     * @notice Convenience wrapper — sets L1 resolution (called by registry).
     */
    function set(string calldata username, address wallet) external onlyRegistrar {
        if (wallet == address(0)) revert ZeroAddress();
        if (bytes(username).length == 0) revert EmptyUsername();

        bytes32 key = keccak256(bytes(username));
        _forward[key]                     = wallet;
        _forwardByLayer[key][L1_CHAIN_ID] = wallet;
        _reverse[wallet]                  = username;
        _usernameByKey[key]               = username;

        emit EntrySet(key, username, wallet, L1_CHAIN_ID);
    }

    /**
     * @notice Remove all resolution entries for `username`.
     */
    function remove(string calldata username) external onlyRegistrar {
        bytes32 key = keccak256(bytes(username));
        address wallet = _forward[key];

        delete _forward[key];
        delete _forwardByLayer[key][L1_CHAIN_ID];
        delete _forwardByLayer[key][L2_CHAIN_ID];
        delete _forwardByLayer[key][L3_CHAIN_ID];
        if (bytes(_reverse[wallet]).length > 0) delete _reverse[wallet];

        emit EntryRemoved(key, username, wallet);
    }

    // ─── Read (open) ─────────────────────────────────────────────────────────

    /// @notice Resolve username to L1 wallet address.
    function resolve(string calldata username) external view returns (address) {
        return _forward[keccak256(bytes(username))];
    }

    /// @notice Resolve username to wallet on a specific GhostChain layer.
    function resolveForLayer(string calldata username, uint256 chainId) external view returns (address) {
        _validateChainId(chainId);
        return _forwardByLayer[keccak256(bytes(username))][chainId];
    }

    /// @notice Reverse resolve: wallet address → username.
    function reverseResolve(address wallet) external view returns (string memory) {
        return _reverse[wallet];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _validateChainId(uint256 chainId) internal pure {
        if (chainId != L1_CHAIN_ID && chainId != L2_CHAIN_ID && chainId != L3_CHAIN_ID)
            revert InvalidChainId();
    }
}
