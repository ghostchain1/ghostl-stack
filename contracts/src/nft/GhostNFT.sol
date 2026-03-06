// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";

interface IGST721Receiver {
    function onGST721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

/// @notice Minimal GST721-compatible NFT with admin-controlled minting.
contract GhostNFT is Ownable {
    string public name;
    string public symbol;
    uint256 public nextTokenId;

    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private tokenApprovals;
    mapping(address => mapping(address => bool)) private operatorApprovals;
    mapping(uint256 => string) private tokenUris;
    mapping(address => bool) public minters;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MinterChanged(address indexed account, bool allowed);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
        minters[msg.sender] = true;
        emit MinterChanged(msg.sender, true);
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }

    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "owner=0");
        return balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = owners[tokenId];
        require(owner != address(0), "not minted");
        return owner;
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(owners[tokenId] != address(0), "not minted");
        return tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return operatorApprovals[owner][operator];
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(owners[tokenId] != address(0), "not minted");
        return tokenUris[tokenId];
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterChanged(account, allowed);
    }

    function approve(address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(to != owner, "approve to owner");
        require(msg.sender == owner || isApprovedForAll(owner, msg.sender), "not approved");
        tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(operator != msg.sender, "operator=self");
        operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "not approved");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "not approved");
        _transfer(from, to, tokenId);
        _checkOnGST721Received(from, to, tokenId, data);
    }

    function mint(address to, string memory uri) external onlyMinter returns (uint256) {
        require(to != address(0), "to=0");
        uint256 tokenId = ++nextTokenId;
        _mint(to, tokenId);
        tokenUris[tokenId] = uri;
        return tokenId;
    }

    function mint(address to, uint256 tokenId, string memory uri) external onlyMinter {
        require(to != address(0), "to=0");
        require(owners[tokenId] == address(0), "minted");
        _mint(to, tokenId);
        tokenUris[tokenId] = uri;
    }

    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "not approved");
        _burn(tokenId);
    }

    function _mint(address to, uint256 tokenId) internal {
        require(owners[tokenId] == address(0), "minted");
        balances[to] += 1;
        owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address owner = ownerOf(tokenId);
        _approve(address(0), tokenId);
        balances[owner] -= 1;
        delete owners[tokenId];
        delete tokenUris[tokenId];
        emit Transfer(owner, address(0), tokenId);
    }

    function _approve(address to, uint256 tokenId) internal {
        tokenApprovals[tokenId] = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "owner");
        require(to != address(0), "to=0");
        _approve(address(0), tokenId);
        balances[from] -= 1;
        balances[to] += 1;
        owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }

    function _checkOnGST721Received(address from, address to, uint256 tokenId, bytes memory data) internal {
        if (to.code.length == 0) return;
        bytes4 retval = IGST721Receiver(to).onGST721Received(msg.sender, from, tokenId, data);
        require(retval == IGST721Receiver.onGST721Received.selector, "unsafe recipient");
    }
}
