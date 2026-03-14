// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  ReserveCollateral
/// @notice Governments pledge strategic reserves as collateral to access GSX liquidity.
///         Implements lock, release, and liquidation mechanics.
contract ReserveCollateral {

    enum CollateralStatus { Unlocked, Locked, Released, Liquidated }

    struct CollateralPosition {
        bytes32         reserveId;
        address         owner;
        uint256         lockedQuantity;
        uint256         collateralValueUSD;
        uint256         liquidityReceived;
        CollateralStatus status;
        uint256         lockedAt;
        uint256         releaseAt;         // earliest release timestamp
    }

    mapping(bytes32 => CollateralPosition) public positions;
    bytes32[]                              public positionIds;
    mapping(address => bool)               public authorizedLiquidators;
    address public admin;

    event ReserveLocked(bytes32 indexed posId, bytes32 reserveId, address owner, uint256 quantity, uint256 valueUSD);
    event LiquidityGranted(bytes32 indexed posId, uint256 liquidity);
    event ReserveReleased(bytes32 indexed posId);
    event CollateralLiquidated(bytes32 indexed posId, address liquidator);

    modifier onlyAdmin()      { require(msg.sender == admin, "Collateral: not admin"); _; }
    modifier onlyLiquidator() {
        require(authorizedLiquidators[msg.sender] || msg.sender == admin, "Collateral: not liquidator");
        _;
    }

    constructor() {
        admin = msg.sender;
        authorizedLiquidators[msg.sender] = true;
    }

    function authorizeLiquidator(address l, bool auth) external onlyAdmin {
        authorizedLiquidators[l] = auth;
    }

    function lockReserve(
        bytes32 reserveId,
        uint256 quantity,
        uint256 collateralValueUSD,
        uint256 lockDuration
    ) external returns (bytes32 posId) {
        posId = keccak256(abi.encode(reserveId, msg.sender, block.timestamp));
        positions[posId] = CollateralPosition({
            reserveId:          reserveId,
            owner:              msg.sender,
            lockedQuantity:     quantity,
            collateralValueUSD: collateralValueUSD,
            liquidityReceived:  0,
            status:             CollateralStatus.Locked,
            lockedAt:           block.timestamp,
            releaseAt:          block.timestamp + lockDuration
        });
        positionIds.push(posId);
        emit ReserveLocked(posId, reserveId, msg.sender, quantity, collateralValueUSD);
    }

    function grantLiquidity(bytes32 posId, uint256 liquidity) external onlyAdmin {
        CollateralPosition storage pos = positions[posId];
        require(pos.status == CollateralStatus.Locked, "Collateral: not locked");
        pos.liquidityReceived += liquidity;
        emit LiquidityGranted(posId, liquidity);
    }

    function releaseReserve(bytes32 posId) external {
        CollateralPosition storage pos = positions[posId];
        require(pos.owner == msg.sender || msg.sender == admin, "Collateral: not owner");
        require(pos.status == CollateralStatus.Locked, "Collateral: not locked");
        require(block.timestamp >= pos.releaseAt, "Collateral: lock period active");
        pos.status = CollateralStatus.Released;
        emit ReserveReleased(posId);
    }

    function liquidateReserve(bytes32 posId) external onlyLiquidator {
        CollateralPosition storage pos = positions[posId];
        require(pos.status == CollateralStatus.Locked, "Collateral: not locked");
        pos.status = CollateralStatus.Liquidated;
        emit CollateralLiquidated(posId, msg.sender);
    }

    function positionCount() external view returns (uint256) { return positionIds.length; }
}
