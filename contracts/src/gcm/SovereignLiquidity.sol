// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  SovereignLiquidity
/// @notice Central bank-managed liquidity pools used by GSX exchange and GSN settlement.
///         Each pool is backed by a specific CBDC or reserve asset.
contract SovereignLiquidity {

    struct LiquidityPool {
        bytes32 asset;          // keccak256 of asset symbol
        string  name;
        uint256 totalLiquidity;
        uint256 available;
        address manager;        // central bank managing this pool
        bool    active;
    }

    mapping(bytes32 => LiquidityPool) public pools;
    bytes32[]                         public poolIds;
    mapping(address => bool)          public authorizedManagers;
    address public admin;

    event PoolCreated(bytes32 indexed poolId, bytes32 asset, string name, address manager);
    event LiquidityAdded(bytes32 indexed poolId, uint256 amount, uint256 newTotal);
    event LiquidityRemoved(bytes32 indexed poolId, uint256 amount, uint256 newTotal);
    event PoolStatusChanged(bytes32 indexed poolId, bool active);

    modifier onlyAdmin()   { require(msg.sender == admin, "SovLiquidity: not admin"); _; }
    modifier onlyManager(bytes32 poolId) {
        require(msg.sender == pools[poolId].manager || msg.sender == admin, "SovLiquidity: not manager");
        _;
    }

    constructor() { admin = msg.sender; }

    function createPool(bytes32 asset, string memory name) external onlyAdmin returns (bytes32 poolId) {
        poolId = keccak256(abi.encode(asset, block.timestamp));
        pools[poolId] = LiquidityPool({
            asset:          asset,
            name:           name,
            totalLiquidity: 0,
            available:      0,
            manager:        msg.sender,
            active:         true
        });
        poolIds.push(poolId);
        emit PoolCreated(poolId, asset, name, msg.sender);
    }

    function addLiquidity(bytes32 poolId, uint256 amount) external onlyManager(poolId) {
        LiquidityPool storage pool = pools[poolId];
        require(pool.active, "SovLiquidity: pool inactive");
        pool.totalLiquidity += amount;
        pool.available      += amount;
        emit LiquidityAdded(poolId, amount, pool.totalLiquidity);
    }

    function removeLiquidity(bytes32 poolId, uint256 amount) external onlyManager(poolId) {
        LiquidityPool storage pool = pools[poolId];
        require(pool.available >= amount, "SovLiquidity: insufficient liquidity");
        pool.totalLiquidity -= amount;
        pool.available      -= amount;
        emit LiquidityRemoved(poolId, amount, pool.totalLiquidity);
    }

    function setPoolStatus(bytes32 poolId, bool active) external onlyAdmin {
        pools[poolId].active = active;
        emit PoolStatusChanged(poolId, active);
    }

    function poolCount() external view returns (uint256) { return poolIds.length; }
}
