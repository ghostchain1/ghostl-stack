// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (l1/GhostIdentity.sol)
pragma solidity 0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { GhostOwnable } from "../ghost/GhostOwnable.sol";
import { GhostReentrancyGuard } from "../ghost/GhostReentrancyGuard.sol";

/// @title  GhostIdentity
/// @notice On-chain username registry anchored to GhostChain L1 (chain_id 14000101).
///
///         Every user who registers a ghost handle (e.g. djNova.ghost) can
///         permanently anchor it to GhostChain L1 here for cross-app portability
///         across LitVybzLive, GhostWallet, GhostXchange, and GhostGames.
///
///         Design:
///           • Username → owner address (forward lookup)
///           • Address  → username      (reverse lookup; one username per address)
///           • Owner of a username may transfer it (like a GNS name)
///           • A designated `ghostBrainOracle` can grant `verified_creator` status
///           • Governance (owner) may pause registrations in emergencies
///           • No ETH/GST fee is charged at the contract level — registration
///             economics are enforced by the off-chain service and GST allowance.
///
///         GhostL2/L3 transactions are NEVER routed here. This contract is
///         pure record-keeping for L1 permanence.
contract GhostIdentity is GhostBrand, GhostOwnable, GhostReentrancyGuard {

    // ─── Errors ───────────────────────────────────────────────────────────────

    error GhostIdentity__WrongChain(uint256 expected, uint256 actual);
    error GhostIdentity__EmptyUsername();
    error GhostIdentity__UsernameTooLong(uint256 length, uint256 max);
    error GhostIdentity__InvalidCharacter();
    error GhostIdentity__UsernameTaken(string username);
    error GhostIdentity__AddressAlreadyRegistered(address account);
    error GhostIdentity__NotUsernameOwner(string username, address caller);
    error GhostIdentity__UsernameNotFound(string username);
    error GhostIdentity__TransferToZeroAddress();
    error GhostIdentity__Paused();
    error GhostIdentity__NotGhostBrainOracle();

    // ─── Events ───────────────────────────────────────────────────────────────

    event IdentityRegistered(
        string  indexed username,
        address indexed owner,
        string          ghostHandle
    );
    event IdentityTransferred(
        string  indexed username,
        address indexed previousOwner,
        address indexed newOwner
    );
    event MetadataURISet(string indexed username, string uri);
    event CreatorVerified(string indexed username, address indexed owner, bool status);
    event GhostBrainOracleUpdated(address indexed previousOracle, address indexed newOracle);
    event RegistrationsPaused(bool paused);

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public constant MAX_USERNAME_LENGTH = 32;

    /// @notice Forward mapping: lowercase username → owning address.
    mapping(bytes32 => address) private _usernameToOwner;

    /// @notice Reverse mapping: address → lowercase username bytes32 key.
    mapping(address => bytes32) private _ownerToUsername;

    /// @notice IPFS / HTTPS metadata URI for each username.
    mapping(bytes32 => string) private _metadataURIs;

    /// @notice Verification status set by GhostBrain oracle.
    mapping(bytes32 => bool) private _verified;

    /// @notice GhostBrain oracle address — allowed to set verified status.
    address public ghostBrainOracle;

    /// @notice When true, no new registrations are accepted (governance emergency).
    bool public registrationsPaused;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _ghostBrainOracle) GhostOwnable(msg.sender) GhostReentrancyGuard() {
        ghostBrainOracle = _ghostBrainOracle;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyL1() {
        if (block.chainid != L1_CHAIN_ID) {
            revert GhostIdentity__WrongChain(L1_CHAIN_ID, block.chainid);
        }
        _;
    }

    modifier notPaused() {
        if (registrationsPaused) revert GhostIdentity__Paused();
        _;
    }

    modifier onlyGhostBrain() {
        if (msg.sender != ghostBrainOracle) revert GhostIdentity__NotGhostBrainOracle();
        _;
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /// @notice Register a new username on GhostChain L1.
    ///         Requirements:
    ///           • Must be called on L1 (chain_id 14000101)
    ///           • Username must be non-empty, ≤ 32 chars, alphanumeric + underscore
    ///           • Username must not already be taken
    ///           • Caller must not already own a username
    /// @param username  Plain username without `.ghost` suffix (e.g. "djNova")
    function register(string calldata username)
        external
        nonReentrant
        onlyL1
        notPaused
    {
        bytes32 key = _validateAndHash(username);

        if (_usernameToOwner[key] != address(0)) {
            revert GhostIdentity__UsernameTaken(username);
        }
        if (_ownerToUsername[msg.sender] != bytes32(0)) {
            revert GhostIdentity__AddressAlreadyRegistered(msg.sender);
        }

        _usernameToOwner[key]       = msg.sender;
        _ownerToUsername[msg.sender] = key;

        emit IdentityRegistered(username, msg.sender, _toGhostHandle(username));
    }

    // ─── Transfer ─────────────────────────────────────────────────────────────

    /// @notice Transfer username ownership to `newOwner`.
    ///         • Caller must be the current username owner.
    ///         • `newOwner` must not already own another username.
    /// @param username  The username to transfer.
    /// @param newOwner  Recipient — must be non-zero and unregistered.
    function transfer(string calldata username, address newOwner)
        external
        nonReentrant
        onlyL1
    {
        if (newOwner == address(0)) revert GhostIdentity__TransferToZeroAddress();

        bytes32 key = _validateAndHash(username);

        if (_usernameToOwner[key] != msg.sender) {
            revert GhostIdentity__NotUsernameOwner(username, msg.sender);
        }
        if (_ownerToUsername[newOwner] != bytes32(0)) {
            revert GhostIdentity__AddressAlreadyRegistered(newOwner);
        }

        _ownerToUsername[msg.sender] = bytes32(0);
        _usernameToOwner[key]        = newOwner;
        _ownerToUsername[newOwner]   = key;

        emit IdentityTransferred(username, msg.sender, newOwner);
    }

    // ─── Metadata ─────────────────────────────────────────────────────────────

    /// @notice Set an IPFS or HTTPS metadata URI for a username.
    ///         Only the current username owner may update this.
    function setMetadataURI(string calldata username, string calldata uri)
        external
        onlyL1
    {
        bytes32 key = _validateAndHash(username);
        if (_usernameToOwner[key] != msg.sender) {
            revert GhostIdentity__NotUsernameOwner(username, msg.sender);
        }
        _metadataURIs[key] = uri;
        emit MetadataURISet(username, uri);
    }

    // ─── Verification ─────────────────────────────────────────────────────────

    /// @notice Grant or revoke `verified_creator` status.
    ///         Only GhostBrain oracle may call this.
    /// @param username  Target username.
    /// @param status    True = verified, false = revoked.
    function setVerified(string calldata username, bool status)
        external
        onlyL1
        onlyGhostBrain
    {
        bytes32 key = _validateAndHash(username);
        if (_usernameToOwner[key] == address(0)) {
            revert GhostIdentity__UsernameNotFound(username);
        }
        _verified[key] = status;
        emit CreatorVerified(username, _usernameToOwner[key], status);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    /// @notice Update the GhostBrain oracle address. Governance only.
    function setGhostBrainOracle(address newOracle) external onlyOwner {
        emit GhostBrainOracleUpdated(ghostBrainOracle, newOracle);
        ghostBrainOracle = newOracle;
    }

    /// @notice Pause / unpause new registrations. Governance emergency only.
    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationsPaused(paused);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Forward lookup: username → owning address.
    /// @return The owner address, or `address(0)` if not registered.
    function resolve(string calldata username) external view returns (address) {
        bytes32 key = _hashUsername(username);
        return _usernameToOwner[key];
    }

    /// @notice Reverse lookup: address → username string.
    /// @return username  The registered username, or empty string if none.
    function reverseResolve(address account) external view returns (string memory) {
        bytes32 key = _ownerToUsername[account];
        if (key == bytes32(0)) return "";
        return _keyToUsername[key];
    }

    /// @notice Returns the canonical `.ghost` handle for a given username.
    function ghostHandle(string calldata username) external pure returns (string memory) {
        return _toGhostHandle(username);
    }

    /// @notice Returns the metadata URI for a given username (may be empty).
    function metadataURI(string calldata username) external view returns (string memory) {
        return _metadataURIs[_hashUsername(username)];
    }

    /// @notice Returns true if the username has been verified by GhostBrain.
    function isVerified(string calldata username) external view returns (bool) {
        return _verified[_hashUsername(username)];
    }

    /// @notice Returns true if the username is already taken.
    function isTaken(string calldata username) external view returns (bool) {
        return _usernameToOwner[_hashUsername(username)] != address(0);
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    /// @dev Storage for reverse-resolving bytes32 key → original username string.
    mapping(bytes32 => string) private _keyToUsername;

    /// @dev Lowercase, validate, and keccak256-hash a username.
    ///      Also stores the lowercased string for reverseResolve.
    function _validateAndHash(string calldata username)
        internal
        returns (bytes32 key)
    {
        uint256 len = bytes(username).length;
        if (len == 0) revert GhostIdentity__EmptyUsername();
        if (len > MAX_USERNAME_LENGTH) {
            revert GhostIdentity__UsernameTooLong(len, MAX_USERNAME_LENGTH);
        }

        // Validate characters: a-z A-Z 0-9 _ only; build lowercased copy.
        bytes memory lower = new bytes(len);
        for (uint256 i = 0; i < len; ) {
            uint8 c = uint8(bytes(username)[i]);
            if (
                (c >= 0x61 && c <= 0x7A) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c == 0x5F)                  // _
            ) {
                lower[i] = bytes1(c);
            } else if (c >= 0x41 && c <= 0x5A) { // A-Z → lowercase
                lower[i] = bytes1(c + 0x20);
            } else {
                revert GhostIdentity__InvalidCharacter();
            }
            unchecked { ++i; }
        }

        key = keccak256(lower);
        if (bytes(_keyToUsername[key]).length == 0) {
            _keyToUsername[key] = string(lower);
        }
    }

    /// @dev Hash only (no validation, no storage write). For view functions.
    function _hashUsername(string calldata username) internal pure returns (bytes32) {
        uint256 len = bytes(username).length;
        bytes memory lower = new bytes(len);
        for (uint256 i = 0; i < len; ) {
            uint8 c = uint8(bytes(username)[i]);
            lower[i] = (c >= 0x41 && c <= 0x5A) ? bytes1(c + 0x20) : bytes1(c);
            unchecked { ++i; }
        }
        return keccak256(lower);
    }

    /// @dev Append `.ghost` suffix, e.g. "djNova" → "@djnova.ghost".
    function _toGhostHandle(string calldata username)
        internal
        pure
        returns (string memory)
    {
        return string(abi.encodePacked("@", username, ".ghost"));
    }
}
