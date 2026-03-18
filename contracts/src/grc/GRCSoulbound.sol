// GhostChain Contracts v5.6.1 (grc/GRCSoulbound.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title GRCSoulbound
/// @notice Non-transferable token standard for GhostChain (GRC-SBT).
///
///         Soulbound tokens are permanently bound to their minting address.
///         They represent identity credentials, reputation badges, certifications,
///         and other non-financial attestations that must not be traded.
///
///         Standard: GRC-SBT (Ghost Soulbound Token)
///         Inspired by legacy EIP-5114 and EIP-4973 patterns, adapted for GhostChain.
///
///         Features:
///           • Non-transferable: `transfer` and `approve` always revert.
///           • Burnable: holder can burn their own token (revoke identity).
///           • Metadata: supports on-chain SVG or IPFS URI per SBT type.
///           • Governance revoke: admin can revoke compromised credentials.
abstract contract GRCSoulbound is GhostBrand {
    // ─── Types ───────────────────────────────────────────────────────────────
    struct SBTData {
        uint64  issuedAt;
        uint64  expiresAt;   // 0 = never expires
        bytes32 category;    // e.g. keccak256("VALIDATOR"), keccak256("KYC"), keccak256("BUILDER")
        string  metadataURI;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    string  public name;
    string  public symbol;
    address public immutable ISSUER;

    uint256 private _tokenIdCounter;

    mapping(uint256 => address)  private _owners;
    mapping(address => uint256)  private _balances;
    mapping(uint256 => SBTData)  private _sbtData;
    /// address → tokenId (enforces one-per-address per credential type per category)
    mapping(address => mapping(bytes32 => uint256)) private _categoryToken;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Issued(address indexed to, uint256 indexed tokenId, bytes32 indexed category);
    event Revoked(address indexed from, uint256 indexed tokenId, address indexed revokedBy);
    event Burned(address indexed from, uint256 indexed tokenId);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error SoulboundNonTransferable();
    error NotIssuer();
    error NotTokenHolder();
    error AlreadyHoldsCategory();
    error TokenExpired();
    error TokenNotFound();

    // ─── Modifier ────────────────────────────────────────────────────────────
    modifier onlyIssuer() {
        _onlyIssuer();
        _;
    }

    function _onlyIssuer() internal view {
        if (msg.sender != ISSUER) revert NotIssuer();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(string memory name_, string memory symbol_, address issuer_) {
        require(issuer_ != address(0), "issuer=0");
        name   = name_;
        symbol = symbol_;
        ISSUER = issuer_;
    }

    // ─── Issuer: mint ─────────────────────────────────────────────────────────
    /// @notice Issue a soulbound token to `to`.
    /// @param to          Recipient address — permanently bound to this wallet.
    /// @param category    Credential category (keccak256 of category string).
    /// @param expiresAt   Expiry timestamp (0 = never expires).
    /// @param metadataURI IPFS or on-chain metadata URI.
    /// @return tokenId    Minted token ID.
    function issue(
        address to,
        bytes32 category,
        uint64  expiresAt,
        string calldata metadataURI
    ) external onlyIssuer returns (uint256 tokenId) {
        require(to != address(0), "to=0");
        if (_categoryToken[to][category] != 0) revert AlreadyHoldsCategory();

        tokenId = ++_tokenIdCounter;
        _owners[tokenId] = to;
        _balances[to]++;
        require(block.timestamp <= type(uint64).max, "ts overflow");
        _sbtData[tokenId] = SBTData({
            issuedAt:    uint64(block.timestamp),
            expiresAt:   expiresAt,
            category:    category,
            metadataURI: metadataURI
        });
        _categoryToken[to][category] = tokenId;

        emit Issued(to, tokenId, category);
    }

    // ─── Issuer: revoke ───────────────────────────────────────────────────────
    /// @notice Issuer revokes a soulbound token (e.g. credential invalidated).
    function revoke(uint256 tokenId) external onlyIssuer {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert TokenNotFound();
        bytes32 category = _sbtData[tokenId].category;
        _burn(tokenId, owner);
        delete _categoryToken[owner][category];
        emit Revoked(owner, tokenId, msg.sender);
    }

    // ─── Holder: burn ─────────────────────────────────────────────────────────
    /// @notice Token holder voluntarily burns their soulbound token.
    function burn(uint256 tokenId) external {
        address owner = _owners[tokenId];
        if (owner != msg.sender) revert NotTokenHolder();
        bytes32 category = _sbtData[tokenId].category;
        _burn(tokenId, owner);
        delete _categoryToken[owner][category];
        emit Burned(owner, tokenId);
    }

    // ─── View ─────────────────────────────────────────────────────────────────
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert TokenNotFound();
        return owner;
    }

    function balanceOf(address holder) external view returns (uint256) {
        return _balances[holder];
    }

    function tokenDataOf(uint256 tokenId) external view returns (SBTData memory) {
        return _sbtData[tokenId];
    }

    function isValid(uint256 tokenId) external view returns (bool) {
        SBTData storage d = _sbtData[tokenId];
        if (_owners[tokenId] == address(0)) return false;
        if (d.expiresAt != 0 && block.timestamp > d.expiresAt) return false;
        return true;
    }

    function tokenForCategory(address holder, bytes32 category) external view returns (uint256) {
        return _categoryToken[holder][category];
    }

    // ─── Transfer blocked ─────────────────────────────────────────────────────
    function transferFrom(address, address, uint256) external pure {
        revert SoulboundNonTransferable();
    }
    function approve(address, uint256) external pure {
        revert SoulboundNonTransferable();
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _burn(uint256 tokenId, address owner) internal {
        delete _owners[tokenId];
        delete _sbtData[tokenId];
        if (_balances[owner] > 0) _balances[owner]--;
    }
}

/// @notice Concrete GhostChain identity credential SBT collection.
contract GhostIdentitySBT is GRCSoulbound {
    bytes32 public constant CATEGORY_KYC         = keccak256("GHOSTCHAIN_KYC");
    bytes32 public constant CATEGORY_VALIDATOR    = keccak256("GHOSTCHAIN_VALIDATOR");
    bytes32 public constant CATEGORY_BUILDER      = keccak256("GHOSTCHAIN_BUILDER");
    bytes32 public constant CATEGORY_CITIZEN      = keccak256("GHOSTCHAIN_CITIZEN");
    bytes32 public constant CATEGORY_AI_AGENT     = keccak256("GHOSTCHAIN_AI_AGENT");

    constructor(address issuer_)
        GRCSoulbound("GhostChain Identity", "GHOST-ID", issuer_)
    {}
}
