// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GRC-721 — Ghost Non-Fungible Token Standard
 * @notice GhostChain native NFT standard.
 *         API-compatible with ERC-721 for tooling interoperability.
 * @dev Implements ownerOf, balanceOf, approve, transferFrom, safeTransferFrom.
 *      Does NOT pull in ERC-165 to stay minimal; add it via interface if needed.
 */
contract GRC721 {
    // ── Storage ──────────────────────────────────────────────────────────────

    string public name;
    string public symbol;

    mapping(uint256 => address)           internal _owners;
    mapping(address => uint256)           internal _balances;
    mapping(uint256 => address)           internal _tokenApprovals;
    mapping(address => mapping(address => bool)) internal _operatorApprovals;

    // ── Events ────────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(string memory _name, string memory _symbol) {
        name   = _name;
        symbol = _symbol;
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _owners[tokenId];
        require(owner != address(0), "GRC721: token does not exist");
    }

    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "GRC721: zero address");
        return _balances[owner];
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "GRC721: token does not exist");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    // ── Approvals ────────────────────────────────────────────────────────────

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "GRC721: not owner or operator"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "GRC721: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ── Transfers ────────────────────────────────────────────────────────────

    function transferFrom(address from, address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(
            msg.sender == owner ||
            msg.sender == _tokenApprovals[tokenId] ||
            _operatorApprovals[owner][msg.sender],
            "GRC721: not authorized"
        );
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        _checkOnGRC721Received(from, to, tokenId, data);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "GRC721: wrong owner");
        require(to != address(0), "GRC721: transfer to zero");

        delete _tokenApprovals[tokenId];
        unchecked {
            _balances[from] -= 1;
            _balances[to]   += 1;
        }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "GRC721: mint to zero");
        require(_owners[tokenId] == address(0), "GRC721: already minted");
        unchecked { _balances[to] += 1; }
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address owner = ownerOf(tokenId);
        delete _tokenApprovals[tokenId];
        unchecked { _balances[owner] -= 1; }
        delete _owners[tokenId];
        emit Transfer(owner, address(0), tokenId);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    /// @dev Calls onGRC721Received on contract recipients (matches ERC-721 receiver interface).
    function _checkOnGRC721Received(address from, address to, uint256 tokenId, bytes memory data) private {
        if (to.code.length > 0) {
            try IGRC721Receiver(to).onGRC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                require(
                    retval == IGRC721Receiver.onGRC721Received.selector,
                    "GRC721: receiver rejected"
                );
            } catch {
                revert("GRC721: receiver failed");
            }
        }
    }
}

interface IGRC721Receiver {
    function onGRC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}
