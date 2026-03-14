// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IGNSRegistry.sol";

// ────────────────────────────────────────────────────────────────────────────
// GNSResolver — Ghost Name Service, L1 Public Resolver
//
// Supports multi-record types per node:
//   • address (coin-type 60 = EVM default)
//   • text records (avatar, url, email, description, ...)
//   • content hash (IPFS / Arweave)
//   • ABI record
//
// Only the name owner (or approved operator via GNSRegistry) may write.
// ────────────────────────────────────────────────────────────────────────────

contract GNSResolver {
    // ── Storage ──────────────────────────────────────────────────────────────
    IGNSRegistry public immutable registry;

    /// node → coinType → address bytes (supports multichain addresses)
    mapping(bytes32 => mapping(uint256 => bytes))   public addrRecords;
    /// node → key → text value
    mapping(bytes32 => mapping(string => string))   public textRecords;
    /// node → content hash bytes
    mapping(bytes32 => bytes)                       public contentHashes;
    /// node → ABI (interface bytes)
    mapping(bytes32 => bytes)                       public abiRecords;
    /// node → pubkey (x, y)
    mapping(bytes32 => bytes32[2])                  public pubkeys;

    // ── Events ────────────────────────────────────────────────────────────────
    event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress);
    event TextChanged(bytes32 indexed node, string indexed key, string value);
    event ContentHashChanged(bytes32 indexed node, bytes hash);
    event ABIChanged(bytes32 indexed node);
    event PubkeyChanged(bytes32 indexed node, bytes32 x, bytes32 y);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotAuthorised();
    error NameExpired();

    uint256 internal constant COIN_TYPE_ETH = 60;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _registry) {
        registry = IGNSRegistry(_registry);
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    modifier authorised(bytes32 node) {
        if (registry.isExpired(node)) revert NameExpired();
        (address own, , address approved, , ) = registry.records(node);
        bool isOp = registry.operators(node, msg.sender);
        if (own != msg.sender && approved != msg.sender && !isOp) revert NotAuthorised();
        _;
    }

    // ── Address records ───────────────────────────────────────────────────────
    function setAddr(bytes32 node, address _addr) external authorised(node) {
        bytes memory bAddr = abi.encodePacked(_addr);
        addrRecords[node][COIN_TYPE_ETH] = bAddr;
        emit AddressChanged(node, COIN_TYPE_ETH, bAddr);
    }

    function setAddrMultichain(bytes32 node, uint256 coinType, bytes calldata _addr)
        external
        authorised(node)
    {
        addrRecords[node][coinType] = _addr;
        emit AddressChanged(node, coinType, _addr);
    }

    function addr(bytes32 node) external view returns (address payable) {
        bytes memory b = addrRecords[node][COIN_TYPE_ETH];
        if (b.length == 0) return payable(address(0));
        address a;
        assembly { a := mload(add(b, 20)) }
        return payable(a);
    }

    function addrMultichain(bytes32 node, uint256 coinType)
        external
        view
        returns (bytes memory)
    {
        return addrRecords[node][coinType];
    }

    // ── Text records ──────────────────────────────────────────────────────────
    function setText(bytes32 node, string calldata key, string calldata value)
        external
        authorised(node)
    {
        textRecords[node][key] = value;
        emit TextChanged(node, key, value);
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return textRecords[node][key];
    }

    // ── Content hash ──────────────────────────────────────────────────────────
    function setContenthash(bytes32 node, bytes calldata hash) external authorised(node) {
        contentHashes[node] = hash;
        emit ContentHashChanged(node, hash);
    }

    function contenthash(bytes32 node) external view returns (bytes memory) {
        return contentHashes[node];
    }

    // ── ABI ───────────────────────────────────────────────────────────────────
    function setABI(bytes32 node, bytes calldata data) external authorised(node) {
        abiRecords[node] = data;
        emit ABIChanged(node);
    }

    function ABI(bytes32 node) external view returns (bytes memory) {
        return abiRecords[node];
    }

    // ── Pubkey ────────────────────────────────────────────────────────────────
    function setPubkey(bytes32 node, bytes32 x, bytes32 y) external authorised(node) {
        pubkeys[node] = [x, y];
        emit PubkeyChanged(node, x, y);
    }

    function pubkey(bytes32 node) external view returns (bytes32 x, bytes32 y) {
        bytes32[2] memory pk = pubkeys[node];
        return (pk[0], pk[1]);
    }

    // ── GST-165 supportsInterface ─────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return
            interfaceID == 0x01ffc9a7 || // GST-165 (interface detection)
            interfaceID == 0x3b3b57de || // addr(bytes32)
            interfaceID == 0x59d1d43c || // text(bytes32,string)
            interfaceID == 0xbc1c58d1;   // contenthash(bytes32)
    }
}
