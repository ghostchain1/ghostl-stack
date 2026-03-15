// GhostChain Contracts v5.6.1 (contracts/src/l3/multiverse/WorldRegistry.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";

/// @title  WorldRegistry
/// @notice On-chain registry of virtual worlds approved to integrate with the
///         GhostChain Multiverse layer.  Admin-curated — world operators are
///         added after off-chain verification then toggled active on-chain.
contract WorldRegistry is GhostBrand, GhostOwnable {
    // ── Errors ────────────────────────────────────────────────────────────────
    error WorldRegistry__WrongChain(uint256 expected, uint256 actual);
    error WorldRegistry__AlreadyRegistered(bytes32 worldId);
    error WorldRegistry__NotRegistered(bytes32 worldId);
    error WorldRegistry__InvalidParams();

    // ── Events ────────────────────────────────────────────────────────────────
    event WorldRegistered(bytes32 indexed worldId, string name, string apiEndpoint);
    event WorldStatusChanged(bytes32 indexed worldId, bool active);
    event WorldAssetsUpdated(bytes32 indexed worldId, string[] supportedAssets);

    // ── Structs ───────────────────────────────────────────────────────────────
    struct World {
        string  name;
        string  apiEndpoint;
        bool    active;
        uint256 registeredAt;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    mapping(bytes32 => World)     public worlds;
    mapping(bytes32 => string[])  public worldAssets;
    bytes32[]                     private _worldIds;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _admin) GhostOwnable(_admin) {
        if (_admin == address(0)) revert WorldRegistry__InvalidParams();
    }

    // ── Registration ──────────────────────────────────────────────────────────

    /// @notice Register a new virtual world. Only callable by admin.
    /// @param worldId         Unique identifier (keccak256 of world name recommended)
    /// @param name            Human-readable world name (e.g. "GhostArena")
    /// @param apiEndpoint     Off-chain API URL for world integration events
    /// @param supportedAssets List of asset types this world accepts (e.g. ["avatar","nft"])
    function registerWorld(
        bytes32         worldId,
        string calldata name,
        string calldata apiEndpoint,
        string[] calldata supportedAssets
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert WorldRegistry__WrongChain(L3_CHAIN_ID, block.chainid);
        if (worlds[worldId].registeredAt != 0) revert WorldRegistry__AlreadyRegistered(worldId);
        if (bytes(name).length == 0)           revert WorldRegistry__InvalidParams();

        worlds[worldId] = World({
            name:         name,
            apiEndpoint:  apiEndpoint,
            active:       true,
            registeredAt: block.timestamp
        });
        worldAssets[worldId] = supportedAssets;
        _worldIds.push(worldId);

        emit WorldRegistered(worldId, name, apiEndpoint);
        if (supportedAssets.length > 0) emit WorldAssetsUpdated(worldId, supportedAssets);
    }

    /// @notice Toggle a world's active status (admin only).
    function setWorldActive(bytes32 worldId, bool active) external onlyOwner {
        if (worlds[worldId].registeredAt == 0) revert WorldRegistry__NotRegistered(worldId);
        worlds[worldId].active = active;
        emit WorldStatusChanged(worldId, active);
    }

    /// @notice Replace the full supported-asset list for a world (admin only).
    function updateWorldAssets(
        bytes32 worldId,
        string[] calldata supportedAssets
    ) external onlyOwner {
        if (worlds[worldId].registeredAt == 0) revert WorldRegistry__NotRegistered(worldId);
        worldAssets[worldId] = supportedAssets;
        emit WorldAssetsUpdated(worldId, supportedAssets);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice True if the world is registered and currently active.
    function isActive(bytes32 worldId) external view returns (bool) {
        return worlds[worldId].active;
    }

    /// @notice Total number of registered worlds.
    function totalWorlds() external view returns (uint256) {
        return _worldIds.length;
    }

    /// @notice Paginated list of world IDs.
    function listWorlds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        uint256 total = _worldIds.length;
        if (offset >= total) return ids;
        uint256 end = offset + limit;
        if (end > total) end = total;
        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ) {
            ids[i - offset] = _worldIds[i];
            unchecked { ++i; }
        }
    }

    /// @notice Supported asset types for a world.
    function getWorldAssets(bytes32 worldId) external view returns (string[] memory) {
        return worldAssets[worldId];
    }
}
