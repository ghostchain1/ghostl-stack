// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IGNSRegistry.sol";

// ────────────────────────────────────────────────────────────────────────────
// GNSNameWrapper — Ghost Name Service ERC-721 NFT Wrapper
//
// Each registered .ghost name becomes a transferable ERC-721 NFT.
// Token ID = uint256(bytes32 node).
// Wrapping delegates GNSRegistry ownership to this contract while the NFT
// holder retains economic and resolver-control rights.
// ────────────────────────────────────────────────────────────────────────────

contract GNSNameWrapper {
    // ── ERC-721 storage ───────────────────────────────────────────────────────
    string public name   = "Ghost Name Service";
    string public symbol = "GNS";

    mapping(uint256 => address)                         private _owners;
    mapping(address => uint256)                         private _balances;
    mapping(uint256 => address)                         private _tokenApprovals;
    mapping(address => mapping(address => bool))        private _operatorApprovals;

    // ── GNS state ─────────────────────────────────────────────────────────────
    IGNSRegistry public immutable registry;
    address public owner;

    mapping(uint256 => string) private _tokenLabels;

    // ── Events ────────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner_, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner_, address indexed operator, bool approved);
    event Wrapped(bytes32 indexed node, address indexed holder);
    event Unwrapped(bytes32 indexed node, address indexed holder);

    error NotOwner();
    error NotApproved();
    error AlreadyWrapped();
    error NotWrapped();
    error NameExpired();
    error ZeroAddress();

    constructor(address _registry) {
        registry = IGNSRegistry(_registry);
        owner    = msg.sender;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    // ── Wrap ──────────────────────────────────────────────────────────────────
    /// @notice Wrap a GNS name: caller must be registry owner, transfers ownership to wrapper
    function wrap(bytes32 node, string calldata label) external returns (uint256 tokenId) {
        if (registry.owner(node) != msg.sender) revert NotOwner();
        if (registry.isExpired(node))           revert NameExpired();

        tokenId = uint256(node);
        if (_owners[tokenId] != address(0))     revert AlreadyWrapped();

        // Transfer registry ownership to this contract
        registry.transfer(node, address(this));

        _owners[tokenId]    = msg.sender;
        _balances[msg.sender] += 1;
        _tokenLabels[tokenId] = label;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Wrapped(node, msg.sender);
    }

    /// @notice Unwrap: burn NFT, reclaim registry ownership
    function unwrap(bytes32 node) external {
        uint256 tokenId = uint256(node);
        address holder  = _owners[tokenId];
        if (holder == address(0))             revert NotWrapped();
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert NotApproved();

        _burn(tokenId, holder);

        registry.transfer(node, msg.sender);
        emit Unwrapped(node, msg.sender);
    }

    // ── ERC-721 core ──────────────────────────────────────────────────────────
    function balanceOf(address holder) external view returns (uint256) {
        if (holder == address(0)) revert ZeroAddress();
        return _balances[holder];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        if (o == address(0)) revert NotWrapped();
        return o;
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !_operatorApprovals[o][msg.sender]) revert NotApproved();
        _tokenApprovals[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _owner, address operator) public view returns (bool) {
        return _operatorApprovals[_owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert NotApproved();
        if (to == address(0)) revert ZeroAddress();

        bytes32 node = bytes32(tokenId);
        if (registry.isExpired(node)) revert NameExpired();

        _balances[from] -= 1;
        _balances[to]   += 1;
        _owners[tokenId] = to;
        delete _tokenApprovals[tokenId];

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory /*data*/) public {
        transferFrom(from, to, tokenId);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        string memory label = _tokenLabels[tokenId];
        bytes32 node = bytes32(tokenId);
        uint64 exp   = registry.expiry(node);
        return string(abi.encodePacked(
            '{"name":"', label, '.ghost",'
            '"description":"Ghost Name Service identity",'
            '"expiry":', _toString(exp), '}'
        ));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // GST165
            interfaceId == 0x80ac58cd || // GST721
            interfaceId == 0x5b5e139f;   // GST721Metadata
    }

    // ── Internal ──────────────────────────────────────────────────────────────
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address o = _owners[tokenId];
        return (spender == o || getApproved(tokenId) == spender || isApprovedForAll(o, spender));
    }

    function _burn(uint256 tokenId, address holder) internal {
        delete _tokenApprovals[tokenId];
        _balances[holder] -= 1;
        delete _owners[tokenId];
        emit Transfer(holder, address(0), tokenId);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
