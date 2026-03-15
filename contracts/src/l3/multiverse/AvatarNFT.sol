// GhostChain Contracts v5.6.1 (contracts/src/l3/multiverse/AvatarNFT.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GRC721} from "../../ghost/GRC721.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";

/// @title  AvatarNFT
/// @notice GRC-721 avatar NFTs representing a creator's digital persona on GhostL3.
///         Each creator may mint one canonical avatar NFT plus unlimited variant avatars.
///         Avatar model URI and animation set are stored on-chain for cross-world portability.
contract AvatarNFT is GhostBrand, GRC721, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error AvatarNFT__WrongChain(uint256 expected, uint256 actual);
    error AvatarNFT__ZeroAddress();
    error AvatarNFT__EmptyURI();
    error AvatarNFT__NotAuthorised();
    error AvatarNFT__NotMinter();

    // ── Events ────────────────────────────────────────────────────────────────
    event AvatarMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string  modelUri,
        string  animationSet
    );
    event AvatarUpdated(uint256 indexed tokenId, string modelUri, string animationSet);
    event MinterSet(address indexed minter, bool enabled);

    // ── Structs ───────────────────────────────────────────────────────────────
    struct AvatarMeta {
        address creator;
        string  modelUri;
        string  animationSet;
        uint256 mintedAt;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    uint256 private _nextTokenId;

    /// @notice Full metadata for each minted avatar token.
    mapping(uint256 => AvatarMeta) public avatarMeta;

    /// @notice Addresses with minting rights (e.g. MultiverseGateway contract).
    mapping(address => bool) public isMinter;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _admin) GRC721("GhostChain Avatar", "GAVA") GhostOwnable(_admin) {
        if (_admin == address(0)) revert AvatarNFT__ZeroAddress();
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /// @notice Mint an avatar NFT for `creator` with the specified model and animation set.
    ///         Caller must be the owner or an authorised minter.
    function mintAvatar(
        address creator,
        string calldata modelUri,
        string calldata animationSet
    ) external nonReentrant returns (uint256 tokenId) {
        if (block.chainid != L3_CHAIN_ID) revert AvatarNFT__WrongChain(L3_CHAIN_ID, block.chainid);
        if (!isMinter[msg.sender] && msg.sender != owner()) revert AvatarNFT__NotMinter();
        if (creator == address(0)) revert AvatarNFT__ZeroAddress();
        if (bytes(modelUri).length == 0)    revert AvatarNFT__EmptyURI();

        tokenId = _nextTokenId++;
        _mint(creator, tokenId);
        avatarMeta[tokenId] = AvatarMeta({
            creator:      creator,
            modelUri:     modelUri,
            animationSet: animationSet,
            mintedAt:     block.timestamp
        });

        emit AvatarMinted(tokenId, creator, modelUri, animationSet);
    }

    /// @notice Update avatar model and animation set.
    ///         Caller must own the token, be an authorised minter, or be the contract owner.
    function updateAvatar(
        uint256 tokenId,
        string calldata modelUri,
        string calldata animationSet
    ) external {
        if (block.chainid != L3_CHAIN_ID) revert AvatarNFT__WrongChain(L3_CHAIN_ID, block.chainid);
        if (bytes(modelUri).length == 0) revert AvatarNFT__EmptyURI();
        bool authorised = ownerOf(tokenId) == msg.sender
            || isMinter[msg.sender]
            || msg.sender == owner();
        if (!authorised) revert AvatarNFT__NotAuthorised();

        avatarMeta[tokenId].modelUri     = modelUri;
        avatarMeta[tokenId].animationSet = animationSet;
        emit AvatarUpdated(tokenId, modelUri, animationSet);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Grant or revoke minting rights for an address.
    function setMinter(address minter, bool enabled) external onlyOwner {
        if (minter == address(0)) revert AvatarNFT__ZeroAddress();
        isMinter[minter] = enabled;
        emit MinterSet(minter, enabled);
    }

    // ── Metadata ─────────────────────────────────────────────────────────────

    /// @notice Returns the model URI as the token's metadata URI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "GRC721: URI query for nonexistent token");
        return avatarMeta[tokenId].modelUri;
    }

    // ── Block unguarded base mint ─────────────────────────────────────────────

    /// @dev Override base GRC721 open mint — use mintAvatar() instead.
    function mint(address, uint256) public pure override {
        revert("AvatarNFT: use mintAvatar()");
    }

    /// @notice Total avatars minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }
}
