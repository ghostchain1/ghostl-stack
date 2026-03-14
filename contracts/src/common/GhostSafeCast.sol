// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (common/GhostSafeCast.sol)
pragma solidity ^0.8.24;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title GhostSafeCast
 * @notice GhostChain-branded re-export of SafeCast for safe narrowing integer conversions.
 *         Reverts on overflow, eliminating unsafe-typecast lint violations.
 * @dev Re-exports the bundled GhostChain Contracts v5.6.1 SafeCast library.
 *      Import this in all GhostChain contracts instead of referencing the upstream lib directly.
 */
library GhostSafeCast {
    using SafeCast for uint256;
    using SafeCast for int256;

    function toUint248(uint256 value) internal pure returns (uint248) { return SafeCast.toUint248(value); }
    function toUint240(uint256 value) internal pure returns (uint240) { return SafeCast.toUint240(value); }
    function toUint232(uint256 value) internal pure returns (uint232) { return SafeCast.toUint232(value); }
    function toUint224(uint256 value) internal pure returns (uint224) { return SafeCast.toUint224(value); }
    function toUint216(uint256 value) internal pure returns (uint216) { return SafeCast.toUint216(value); }
    function toUint208(uint256 value) internal pure returns (uint208) { return SafeCast.toUint208(value); }
    function toUint200(uint256 value) internal pure returns (uint200) { return SafeCast.toUint200(value); }
    function toUint192(uint256 value) internal pure returns (uint192) { return SafeCast.toUint192(value); }
    function toUint184(uint256 value) internal pure returns (uint184) { return SafeCast.toUint184(value); }
    function toUint176(uint256 value) internal pure returns (uint176) { return SafeCast.toUint176(value); }
    function toUint168(uint256 value) internal pure returns (uint168) { return SafeCast.toUint168(value); }
    function toUint160(uint256 value) internal pure returns (uint160) { return SafeCast.toUint160(value); }
    function toUint152(uint256 value) internal pure returns (uint152) { return SafeCast.toUint152(value); }
    function toUint144(uint256 value) internal pure returns (uint144) { return SafeCast.toUint144(value); }
    function toUint136(uint256 value) internal pure returns (uint136) { return SafeCast.toUint136(value); }
    function toUint128(uint256 value) internal pure returns (uint128) { return SafeCast.toUint128(value); }
    function toUint120(uint256 value) internal pure returns (uint120) { return SafeCast.toUint120(value); }
    function toUint112(uint256 value) internal pure returns (uint112) { return SafeCast.toUint112(value); }
    function toUint104(uint256 value) internal pure returns (uint104) { return SafeCast.toUint104(value); }
    function toUint96(uint256 value) internal pure returns (uint96)   { return SafeCast.toUint96(value); }
    function toUint88(uint256 value) internal pure returns (uint88)   { return SafeCast.toUint88(value); }
    function toUint80(uint256 value) internal pure returns (uint80)   { return SafeCast.toUint80(value); }
    function toUint72(uint256 value) internal pure returns (uint72)   { return SafeCast.toUint72(value); }
    function toUint64(uint256 value) internal pure returns (uint64)   { return SafeCast.toUint64(value); }
    function toUint56(uint256 value) internal pure returns (uint56)   { return SafeCast.toUint56(value); }
    function toUint48(uint256 value) internal pure returns (uint48)   { return SafeCast.toUint48(value); }
    function toUint40(uint256 value) internal pure returns (uint40)   { return SafeCast.toUint40(value); }
    function toUint32(uint256 value) internal pure returns (uint32)   { return SafeCast.toUint32(value); }
    function toUint24(uint256 value) internal pure returns (uint24)   { return SafeCast.toUint24(value); }
    function toUint16(uint256 value) internal pure returns (uint16)   { return SafeCast.toUint16(value); }
    function toUint8(uint256 value) internal pure returns (uint8)     { return SafeCast.toUint8(value); }

    function toUint256(int256 value) internal pure returns (uint256) { return SafeCast.toUint256(value); }
    function toInt256(uint256 value) internal pure returns (int256)   { return SafeCast.toInt256(value); }
    function toInt128(int256 value) internal pure returns (int128)    { return SafeCast.toInt128(value); }
    function toInt64(int256 value) internal pure returns (int64)      { return SafeCast.toInt64(value); }
    function toInt32(int256 value) internal pure returns (int32)      { return SafeCast.toInt32(value); }
    function toInt16(int256 value) internal pure returns (int16)      { return SafeCast.toInt16(value); }
    function toInt8(int256 value) internal pure returns (int8)        { return SafeCast.toInt8(value); }
}
