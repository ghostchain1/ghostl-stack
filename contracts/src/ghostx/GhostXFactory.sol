// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

// GhostChain Contracts v5.6.1 (contracts/src/ghostx/GhostXFactory.sol)

import { GhostXPair } from "./GhostXPair.sol";

/**
 * @title GhostXFactory — GhostXchange Pair Factory
 * @notice Deploys and tracks all GhostXchange liquidity pairs.
 *         Any two distinct GRC-20 tokens create exactly one canonical pair,
 *         deterministically derived from (token0, token1) where token0 < token1.
 * @dev Owner controls the fee recipient. Pairs are immutably registered after creation.
 */
contract GhostXFactory {
    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;
    address public feeRecipient;

    address[] public allPairs;
    mapping(address => mapping(address => address)) public getPair;

    // ── Events ────────────────────────────────────────────────────────────────

    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 totalPairs
    );
    event OwnerUpdated(address indexed from, address indexed to);
    event FeeRecipientUpdated(address indexed from, address indexed to);

    // ── Errors ────────────────────────────────────────────────────────────────

    error IdenticalTokens();
    error ZeroAddress();
    error PairExists();
    error NotOwner();

    // ── Modifier ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "GhostXFactory: zero fee recipient");
        owner        = msg.sender;
        feeRecipient = _feeRecipient;
    }

    // ── External ──────────────────────────────────────────────────────────────

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Creates a new GhostXPair for `tokenA` and `tokenB`.
    ///         Tokens are sorted so token0 < token1 (canonical ordering).
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalTokens();

        // Sort tokens to get canonical (token0, token1) ordering.
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        pair = address(new GhostXPair(address(this), token0, token1));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // reverse mapping for convenience
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /// @notice Transfers ownership to `to`.
    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "GhostXFactory: zero address");
        emit OwnerUpdated(owner, to);
        owner = to;
    }

    /// @notice Updates the fee recipient address.
    function setFeeRecipient(address to) external onlyOwner {
        require(to != address(0), "GhostXFactory: zero address");
        emit FeeRecipientUpdated(feeRecipient, to);
        feeRecipient = to;
    }
}
