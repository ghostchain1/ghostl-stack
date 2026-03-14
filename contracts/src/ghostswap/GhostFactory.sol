// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghostswap/GhostFactory.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { GhostPair } from "./GhostPair.sol";
import { IGhostFactory } from "./IGhostSwap.sol";

/// @title GhostFactory
/// @notice Deploys and tracks all GhostSwap liquidity pairs.
///         Each unordered token pair maps 1:1 to a GhostPair contract
///         deployed via CREATE2 (deterministic address, no duplicates).
///
///         Protocol fee:
///           feeTo    — recipient of 1/6 of swap fees (disabled by default)
///           feeToSetter — the only address that may enable/change feeTo
///
/// @dev Inherits GhostBrand for chain-ID constants but does not use GST_UNIT;
///      included for consistency and future governance hooks.
contract GhostFactory is GhostBrand, IGhostFactory {
    // ─────────────────────── State ───────────────────────────────────────────

    address public override feeTo;
    address public override feeToSetter;

    /// @notice All created pair addresses.
    address[] public override allPairs;

    /// @notice token0 → token1 → pair  (token0 < token1 always).
    mapping(address => mapping(address => address)) public override getPair;

    // ─────────────────────── Init ────────────────────────────────────────────

    constructor(address _feeToSetter) {
        require(_feeToSetter != address(0), "GhostFactory: feeToSetter=0");
        feeToSetter = _feeToSetter;
    }

    // ─────────────────────── View ────────────────────────────────────────────

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    // ─────────────────────── Pair creation ───────────────────────────────────

    /// @notice Deploy a new GhostPair for (tokenA, tokenB).
    ///         Reverts if the pair already exists or either token is address(0) or same.
    /// @return pair  Address of the newly deployed GhostPair.
    function createPair(address tokenA, address tokenB)
        external
        override
        returns (address pair)
    {
        require(tokenA != tokenB, "GhostFactory: identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "GhostFactory: zero address");

        // Sort tokens — token0 always has the lower address.
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        require(getPair[token0][token1] == address(0), "GhostFactory: pair exists");

        // CREATE2: deterministic address from sorted token addresses.
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new GhostPair{salt: salt}());

        GhostPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // reverse mapping for convenience
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    // ─────────────────────── Governance ──────────────────────────────────────

    /// @notice Enable/change the protocol fee recipient.
    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "GhostFactory: forbidden");
        feeTo = _feeTo;
    }

    /// @notice Transfer feeToSetter role (governance transfer).
    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "GhostFactory: forbidden");
        require(_feeToSetter != address(0), "GhostFactory: feeToSetter=0");
        feeToSetter = _feeToSetter;
    }

    // ─────────────────────── Utility ─────────────────────────────────────────

    /// @notice Compute a pair address without deploying.
    ///         Useful for off-chain tooling / router pre-computation.
    /// @param tokenA  One token of the pair.
    /// @param tokenB  The other token.
    /// @return predicted  Expected pair address (if not yet deployed, may not exist).
    function pairFor(address tokenA, address tokenB) external view returns (address predicted) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        bytes32 salt = keccak256(abi.encodePacked(t0, t1));
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(type(GhostPair).creationCode)
            )
        );
        predicted = address(uint160(uint256(hash)));
    }
}
