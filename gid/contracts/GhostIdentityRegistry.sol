// GhostChain Contracts v5.6.1 (gid/contracts/GhostIdentityRegistry.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title GhostIdentityRegistry
 * @notice Sovereign on-chain identity store for GhostChain.
 *
 * Every GhostChain participant — user, validator, or application service —
 * may register a GID (Ghost Identity) consisting of a username and an
 * identity kind, anchored to their wallet address.
 *
 * Identity invariants:
 *   • A username may be registered by exactly one wallet.
 *   • A wallet may hold exactly one active username.
 *   • Only the identity owner may update or deactivate their entry.
 *   • An admin (governance-controlled) may deactivate any identity.
 *
 * Cross-contract integration:
 *   After a successful registration the registry calls the deployed
 *   UsernameResolver (IUsernameResolver) to keep forward/reverse lookup
 *   tables in sync.  The resolver address is set by the admin.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 *
 * Security:
 *   - No fee or value handling; identity is gasless within GhostChain.
 *   - Reentrancy guard on registration paths involving external resolver call.
 *   - String length validation prevents storage bloat / DoS.
 *   - All critical mutations emitting events for off-chain indexing.
 */
contract GhostIdentityRegistry {
    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;
    uint256 internal constant L2_CHAIN_ID = 901;
    uint256 internal constant L3_CHAIN_ID = 903;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum IdentityKind { USER, VALIDATOR, SERVICE }

    struct Identity {
        address  wallet;
        string   username;
        IdentityKind kind;
        uint64   registeredAt;
        bool     active;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;
    address public resolver;         // IUsernameResolver
    bool    private _locked;

    /// @notice Forward lookup: username (lowercase) → Identity.
    mapping(bytes32 => Identity)  private _identities;
    /// @notice Reverse lookup: wallet → canonical-username storage key.
    mapping(address => bytes32)   private _walletToKey;
    /// @notice Validator-specific metadata key set.
    mapping(address => bool)      public  isValidator;

    uint256 public totalRegistered;
    uint256 public totalActive;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_USERNAME_LEN = 32;
    uint256 public constant MIN_USERNAME_LEN = 3;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Registered(
        bytes32 indexed key,
        string  username,
        address indexed wallet,
        IdentityKind kind,
        uint64  registeredAt
    );
    event Deactivated(bytes32 indexed key, address indexed wallet);
    event Reactivated(bytes32 indexed key, address indexed wallet);
    event ResolverUpdated(address indexed newResolver);
    event AdminTransferred(address indexed newAdmin);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotIdentityOwner();
    error ZeroAddress();
    error UsernameTaken();
    error WalletAlreadyRegistered();
    error UsernameTooShort();
    error UsernameTooLong();
    error UsernameInvalidChar();
    error IdentityNotFound();
    error IdentityInactive();
    error IdentityAlreadyActive();
    error ReentrancyAttack();
    error ResolverCallFailed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert ReentrancyAttack();
        _locked = true;
        _;
        _locked = false;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
        emit AdminTransferred(newAdmin);
    }

    function setResolver(address _resolver) external onlyAdmin {
        if (_resolver == address(0)) revert ZeroAddress();
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Register a username identity.
     * @param username   The desired GID handle (3-32 chars, lowercase a-z, 0-9, hyphen).
     * @param kind       USER, VALIDATOR, or SERVICE.
     */
    function register(string calldata username, IdentityKind kind) external nonReentrant {
        bytes32 key = _validate(username);

        if (_identities[key].wallet != address(0)) revert UsernameTaken();
        if (_walletToKey[msg.sender] != bytes32(0)) revert WalletAlreadyRegistered();

        require(block.timestamp <= type(uint64).max, "ts overflow");
        uint64 ts = uint64(block.timestamp);

        _identities[key] = Identity({
            wallet:       msg.sender,
            username:     username,
            kind:         kind,
            registeredAt: ts,
            active:       true
        });
        _walletToKey[msg.sender] = key;

        if (kind == IdentityKind.VALIDATOR) {
            isValidator[msg.sender] = true;
        }

        totalRegistered++;
        totalActive++;

        emit Registered(key, username, msg.sender, kind, ts);

        // Sync resolver if one is configured.
        if (resolver != address(0)) {
            _syncResolver(username, msg.sender);
        }
    }

    // ─── Deactivation / Reactivation ──────────────────────────────────────────

    function deactivate(string calldata username) external {
        bytes32 key = _usernameKey(username);
        Identity storage id = _identities[key];
        if (id.wallet == address(0)) revert IdentityNotFound();
        if (!id.active)              revert IdentityInactive();
        if (msg.sender != id.wallet && msg.sender != admin) revert NotIdentityOwner();

        id.active = false;
        totalActive--;
        emit Deactivated(key, id.wallet);
    }

    function reactivate(string calldata username) external onlyAdmin {
        bytes32 key = _usernameKey(username);
        Identity storage id = _identities[key];
        if (id.wallet == address(0))  revert IdentityNotFound();
        if (id.active)                revert IdentityAlreadyActive();

        id.active = true;
        totalActive++;
        emit Reactivated(key, id.wallet);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getIdentity(string calldata username) external view
        returns (address wallet, IdentityKind kind, uint64 registeredAt, bool active)
    {
        bytes32 key = _usernameKey(username);
        Identity storage id = _identities[key];
        return (id.wallet, id.kind, id.registeredAt, id.active);
    }

    function getUsername(address wallet) external view returns (string memory) {
        bytes32 key = _walletToKey[wallet];
        if (key == bytes32(0)) return "";
        return _identities[key].username;
    }

    function isRegistered(string calldata username) external view returns (bool) {
        bytes32 key = _usernameKey(username);
        return _identities[key].wallet != address(0) && _identities[key].active;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _usernameKey(string calldata username) internal pure returns (bytes32) {
        return keccak256(bytes(username));
    }

    function _validate(string calldata username) internal pure returns (bytes32) {
        bytes memory b = bytes(username);
        if (b.length < MIN_USERNAME_LEN) revert UsernameTooShort();
        if (b.length > MAX_USERNAME_LEN) revert UsernameTooLong();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool valid = (c >= 0x61 && c <= 0x7a)   // a-z
                      || (c >= 0x30 && c <= 0x39)   // 0-9
                      || (c == 0x2d);               // hyphen (-)
            if (!valid) revert UsernameInvalidChar();
        }

        return keccak256(b);
    }

    function _syncResolver(string calldata username, address wallet) internal {
        (bool ok,) = resolver.call(
            abi.encodeWithSignature("set(string,address)", username, wallet)
        );
        if (!ok) revert ResolverCallFailed();
    }
}
