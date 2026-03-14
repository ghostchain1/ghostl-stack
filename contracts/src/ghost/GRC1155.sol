// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GRC-1155 — Ghost Multi-Token Standard
 * @notice GhostChain native multi-token standard (fungible + non-fungible in one).
 *         ABI-compatible with ERC-1155 for bridge/tooling interoperability.
 */
contract GRC1155 {
    // ── Storage ──────────────────────────────────────────────────────────────

    /// @dev id => owner => balance — private storage; use balanceOf(account,id) to query.
    mapping(uint256 => mapping(address => uint256)) internal _balances;
    /// @dev owner => operator => approved
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // ── Events ────────────────────────────────────────────────────────────────

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 amount
    );

    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] amounts
    );

    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event URI(string value, uint256 indexed id);

    // ── Metadata URI (override in subclass) ─────────────────────────────────

    function uri(uint256 /*id*/) public view virtual returns (string memory) {
        return "";
    }

    // ── Approvals ────────────────────────────────────────────────────────────

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "GRC1155: approve to self");
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ── Balance queries ──────────────────────────────────────────────────────

    /// @notice Returns the balance of `account` for token `id`.
    /// @dev Signature matches ERC-1155: balanceOf(address account, uint256 id).
    function balanceOf(address account, uint256 id) public view returns (uint256) {
        return _balances[id][account];
    }

    // ── Batch balance ────────────────────────────────────────────────────────

    function balanceOfBatch(
        address[] calldata accounts,
        uint256[] calldata ids
    ) external view returns (uint256[] memory) {
        require(accounts.length == ids.length, "GRC1155: length mismatch");
        uint256[] memory result = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; ++i) {
            result[i] = _balances[ids[i]][accounts[i]];
        }
        return result;
    }

    // ── Transfers ────────────────────────────────────────────────────────────

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external {
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender],
            "GRC1155: not authorized"
        );
        _transfer(from, to, id, amount);
        emit TransferSingle(msg.sender, from, to, id, amount);
        _checkOnGRC1155Received(msg.sender, from, to, id, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        require(ids.length == amounts.length, "GRC1155: length mismatch");
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender],
            "GRC1155: not authorized"
        );
        for (uint256 i = 0; i < ids.length; ++i) {
            _transfer(from, to, ids[i], amounts[i]);
        }
        emit TransferBatch(msg.sender, from, to, ids, amounts);
        _checkOnGRC1155BatchReceived(msg.sender, from, to, ids, amounts, data);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 id, uint256 amount) internal {
        require(to != address(0), "GRC1155: transfer to zero");
        if (from != address(0)) {
            require(_balances[id][from] >= amount, "GRC1155: insufficient balance");
            unchecked { _balances[id][from] -= amount; }
        }
        _balances[id][to] += amount;
    }

    function _mint(address to, uint256 id, uint256 amount, bytes memory data) internal {
        require(to != address(0), "GRC1155: mint to zero");
        _balances[id][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
        _checkOnGRC1155Received(msg.sender, address(0), to, id, amount, data);
    }

    function _mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {
        require(to != address(0), "GRC1155: mint to zero");
        require(ids.length == amounts.length, "GRC1155: length mismatch");
        for (uint256 i = 0; i < ids.length; ++i) {
            _balances[ids[i]][to] += amounts[i];
        }
        emit TransferBatch(msg.sender, address(0), to, ids, amounts);
        _checkOnGRC1155BatchReceived(msg.sender, address(0), to, ids, amounts, data);
    }

    function _burn(address from, uint256 id, uint256 amount) internal {
        require(_balances[id][from] >= amount, "GRC1155: burn exceeds balance");
        unchecked { _balances[id][from] -= amount; }
        emit TransferSingle(msg.sender, from, address(0), id, amount);
    }

    function _setURI(string memory newUri, uint256 id) internal {
        emit URI(newUri, id);
    }

    // ── Public mint / burn (virtual — override with access control) ───────────

    /// @notice Mints `amount` of token `id` to `to`. Must be overridden with
    ///         access control in concrete contracts.
    function mint(address to, uint256 id, uint256 amount, bytes calldata data) public virtual {
        _mint(to, id, amount, data);
    }

    /// @notice Batch-mints tokens. Must be overridden with access control in
    ///         concrete contracts.
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) public virtual {
        _mintBatch(to, ids, amounts, data);
    }

    /// @notice Burns `amount` of token `id` from `from`. Caller must be `from`
    ///         or an approved operator.
    function burn(address from, uint256 id, uint256 amount) public virtual {
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender],
            "GRC1155: not authorized"
        );
        _burn(from, id, amount);
    }

    /// @notice Batch-burns tokens.
    function burnBatch(
        address from,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) public virtual {
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender],
            "GRC1155: not authorized"
        );
        require(ids.length == amounts.length, "GRC1155: length mismatch");
        for (uint256 i = 0; i < ids.length; ++i) {
            _burn(from, ids[i], amounts[i]);
        }
        emit TransferBatch(msg.sender, from, address(0), ids, amounts);
    }

    // ── Receiver checks ──────────────────────────────────────────────────────

    function _checkOnGRC1155Received(
        address operator, address from, address to,
        uint256 id, uint256 amount, bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IGRC1155Receiver(to).onGRC1155Received(operator, from, id, amount, data) returns (bytes4 retval) {
                require(retval == IGRC1155Receiver.onGRC1155Received.selector, "GRC1155: receiver rejected");
            } catch { revert("GRC1155: receiver failed"); }
        }
    }

    function _checkOnGRC1155BatchReceived(
        address operator, address from, address to,
        uint256[] memory ids, uint256[] memory amounts, bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IGRC1155Receiver(to).onGRC1155BatchReceived(operator, from, ids, amounts, data) returns (bytes4 retval) {
                require(retval == IGRC1155Receiver.onGRC1155BatchReceived.selector, "GRC1155: receiver rejected");
            } catch { revert("GRC1155: receiver failed"); }
        }
    }
}

interface IGRC1155Receiver {
    function onGRC1155Received(
        address operator, address from, uint256 id, uint256 amount, bytes calldata data
    ) external returns (bytes4);

    function onGRC1155BatchReceived(
        address operator, address from, uint256[] calldata ids,
        uint256[] calldata amounts, bytes calldata data
    ) external returns (bytes4);
}
