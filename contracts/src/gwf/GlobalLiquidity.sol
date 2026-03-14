// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  GlobalLiquidity
/// @notice Manages global liquidity pools used by GSX exchange and GSN settlement network.
///         Pools: USD, EUR, JPY, ENERGY, COMMODITY, BOND.
contract GlobalLiquidity {

    struct Pool {
        bytes32 assetId;
        string  name;
        uint256 totalLiquidity;
        uint256 utilized;       // currently locked in settlements
        address controller;     // GCM or authorized entity
        bool    active;
        uint256 utilizationBps; // target utilization in basis points
    }

    mapping(bytes32 => Pool) public pools;
    bytes32[]                public poolIds;
    mapping(address => bool) public controllers;
    address public admin;

    event PoolCreated(bytes32 indexed poolId, bytes32 assetId, string name);
    event LiquidityInjected(bytes32 indexed poolId, uint256 amount, address by);
    event LiquidityWithdrawn(bytes32 indexed poolId, uint256 amount, address by);
    event LiquidityUtilized(bytes32 indexed poolId, uint256 amount);
    event LiquidityReleased(bytes32 indexed poolId, uint256 amount);

    modifier onlyAdmin()      { require(msg.sender == admin, "GlobLiq: not admin"); _; }
    modifier onlyController() {
        require(controllers[msg.sender] || msg.sender == admin, "GlobLiq: not controller");
        _;
    }

    constructor() {
        admin = msg.sender;
        controllers[msg.sender] = true;
    }

    function addController(address c) external onlyAdmin { controllers[c] = true; }

    function createPool(bytes32 assetId, string memory name, uint256 utilizationBps)
        external onlyAdmin returns (bytes32 poolId)
    {
        poolId = keccak256(abi.encode(assetId, block.timestamp));
        pools[poolId] = Pool({
            assetId:        assetId,
            name:           name,
            totalLiquidity: 0,
            utilized:       0,
            controller:     msg.sender,
            active:         true,
            utilizationBps: utilizationBps
        });
        poolIds.push(poolId);
        emit PoolCreated(poolId, assetId, name);
    }

    function injectLiquidity(bytes32 poolId, uint256 amount) external onlyController {
        Pool storage p = pools[poolId];
        require(p.active, "GlobLiq: pool inactive");
        p.totalLiquidity += amount;
        emit LiquidityInjected(poolId, amount, msg.sender);
    }

    function withdrawLiquidity(bytes32 poolId, uint256 amount) external onlyController {
        Pool storage p = pools[poolId];
        require(p.totalLiquidity - p.utilized >= amount, "GlobLiq: insufficient available");
        p.totalLiquidity -= amount;
        emit LiquidityWithdrawn(poolId, amount, msg.sender);
    }

    function utilizeLiquidity(bytes32 poolId, uint256 amount) external onlyController {
        Pool storage p = pools[poolId];
        require(p.totalLiquidity - p.utilized >= amount, "GlobLiq: insufficient available");
        p.utilized += amount;
        emit LiquidityUtilized(poolId, amount);
    }

    function releaseLiquidity(bytes32 poolId, uint256 amount) external onlyController {
        Pool storage p = pools[poolId];
        require(p.utilized >= amount, "GlobLiq: underflow");
        p.utilized -= amount;
        emit LiquidityReleased(poolId, amount);
    }

    function availableLiquidity(bytes32 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        return p.totalLiquidity - p.utilized;
    }

    function poolCount() external view returns (uint256) { return poolIds.length; }
}
