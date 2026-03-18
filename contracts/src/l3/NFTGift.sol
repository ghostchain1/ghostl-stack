// GhostChain Contracts v5.6.1 (contracts/src/l3/NFTGift.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {GRC721Storage} from "../ghost/GRC721Storage.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title NFTGift
/// @notice Mintable NFT collectible gifts (e.g. Dragon) on GhostL3 (chain 903).
///         Branding: GhostChain NFT Gift — never legacy ERC-style naming.
contract NFTGift is GhostBrand, GRC721Storage, GhostOwnable {
    error WrongChain(uint256 expected, uint256 actual);
    error Unauthorized();

    event GiftMinted(address indexed to, uint256 indexed tokenId, string giftId);

    uint256 private _nextTokenId;
    mapping(address => bool) public minters;
    mapping(uint256 => string) public tokenGiftId;

    constructor() GRC721Storage("GhostChain NFT Gift", "GNFTG") GhostOwnable(msg.sender) {}

    modifier onlyMinter() {
        _onlyMinter();
        _;
    }

    function _onlyMinter() internal view {
        if (!minters[msg.sender] && msg.sender != owner()) revert Unauthorized();
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
    }

    function mint(
        address to,
        string calldata giftId,
        string calldata metadataUri
    ) external onlyMinter returns (uint256 tokenId) {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _setTokenURI(tokenId, metadataUri);
        tokenGiftId[tokenId] = giftId;
        emit GiftMinted(to, tokenId, giftId);
    }
}
