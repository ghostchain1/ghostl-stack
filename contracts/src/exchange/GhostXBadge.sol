// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ReentrancyGuard.sol";

/// @title  GhostXBadge
/// @notice Soulbound ERC-721 NFT that represents a trader's membership tier on Ghost X.
///
/// Tiers (non-transferable, upgradable by the staking contract):
///   0 = NONE      – no badge
///   1 = BRONZE    – 10 % fee discount
///   2 = SILVER    – 20 % fee discount
///   3 = GOLD      – 35 % fee discount
///   4 = DIAMOND   – 50 % fee discount
///
/// One badge per address (soulbound).  The staking contract is the sole minter/upgrader.
contract GhostXBadge is ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────────────

    /// @dev Tier enum.  Stored as uint8 in the token's metadata.
    enum Tier { NONE, BRONZE, SILVER, GOLD, DIAMOND }

    struct Badge {
        uint256 tokenId;
        Tier    tier;
        uint256 mintedAt;
        uint256 updatedAt;
    }

    // ─── ERC-721 boilerplate (soulbound – no transfers) ───────────────────────

    string public constant name   = "Ghost X Badge";
    string public constant symbol = "GXBADGE";

    uint256 public totalSupply;

    mapping(uint256 => address)  private _ownerOf;
    mapping(address => uint256)  private _tokenOfOwner;   // 0 = none
    mapping(address => bool)    public  hasBadge;
    mapping(uint256 => Badge)   private _badges;

    // ─── Access ───────────────────────────────────────────────────────────────

    address public owner;
    address public stakingContract;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event BadgeMinted(address indexed trader, uint256 indexed tokenId, Tier tier);
    event BadgeUpgraded(address indexed trader, uint256 indexed tokenId, Tier oldTier, Tier newTier);
    event StakingContractSet(address indexed stakingContract);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotStaking();
    error Soulbound();
    error AlreadyHasBadge();
    error NoBadge();
    error AlreadyMaxTier();
    error TierNotHigher();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyStaking() {
        if (msg.sender != stakingContract) revert NotStaking();
        _;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setStakingContract(address staking) external onlyOwner {
        require(staking != address(0), "badge: zero addr");
        stakingContract = staking;
        emit StakingContractSet(staking);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "badge: zero addr");
        owner = newOwner;
    }

    // ─── Staking-facing ───────────────────────────────────────────────────────

    /// @notice Mint a BRONZE badge to a trader (first badge only).
    function mintBadge(address trader) external onlyStaking returns (uint256 tokenId) {
        if (hasBadge[trader]) revert AlreadyHasBadge();
        tokenId = ++totalSupply;
        _ownerOf[tokenId]      = trader;
        _tokenOfOwner[trader]  = tokenId;
        hasBadge[trader]       = true;
        _badges[tokenId] = Badge({
            tokenId:   tokenId,
            tier:      Tier.BRONZE,
            mintedAt:  block.timestamp,
            updatedAt: block.timestamp
        });
        emit Transfer(address(0), trader, tokenId);
        emit BadgeMinted(trader, tokenId, Tier.BRONZE);
    }

    /// @notice Upgrade a trader's badge to the next tier.
    function upgradeBadge(address trader, Tier newTier) external onlyStaking {
        if (!hasBadge[trader]) revert NoBadge();
        uint256 tokenId = _tokenOfOwner[trader];
        Badge storage b = _badges[tokenId];
        if (b.tier == Tier.DIAMOND) revert AlreadyMaxTier();
        if (uint8(newTier) <= uint8(b.tier)) revert TierNotHigher();
        Tier old = b.tier;
        b.tier = newTier;
        b.updatedAt = block.timestamp;
        emit BadgeUpgraded(trader, tokenId, old, newTier);
    }

    // ─── ERC-721 view (soulbound – no transfers) ──────────────────────────────

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _ownerOf[tokenId];
        require(o != address(0), "badge: not minted");
        return o;
    }

    function balanceOf(address trader) external view returns (uint256) {
        return hasBadge[trader] ? 1 : 0;
    }

    /// @notice Revert on any transfer attempt — badges are soulbound.
    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7  // ERC-165
            || interfaceId == 0x80ac58cd; // ERC-721
    }

    // ─── Ghost X — fee discount helpers ──────────────────────────────────────

    /// @notice Return fee discount in basis points for a trader.
    ///         Applied as: actualFeeBps = feeBps - (feeBps * discountBps / 10_000)
    function discountBps(address trader) external view returns (uint256) {
        if (!hasBadge[trader]) return 0;
        Tier t = _badges[_tokenOfOwner[trader]].tier;
        if (t == Tier.BRONZE)  return 1_000; // 10 %
        if (t == Tier.SILVER)  return 2_000; // 20 %
        if (t == Tier.GOLD)    return 3_500; // 35 %
        if (t == Tier.DIAMOND) return 5_000; // 50 %
        return 0;
    }

    /// @notice Return raw badge metadata for a trader.
    function getBadge(address trader) external view returns (Badge memory) {
        require(hasBadge[trader], "badge: none");
        return _badges[_tokenOfOwner[trader]];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        address o = _ownerOf[tokenId];
        require(o != address(0), "badge: not minted");
        Tier t = _badges[tokenId].tier;
        return string(abi.encodePacked(
            "https://meta.ghostchain.io/ghostx/badge/",
            _tierName(t),
            "/", _toString(tokenId)
        ));
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _tierName(Tier t) internal pure returns (string memory) {
        if (t == Tier.BRONZE)  return "bronze";
        if (t == Tier.SILVER)  return "silver";
        if (t == Tier.GOLD)    return "gold";
        if (t == Tier.DIAMOND) return "diamond";
        return "none";
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v; uint256 digits;
        while (n != 0) { digits++; n /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }
}
