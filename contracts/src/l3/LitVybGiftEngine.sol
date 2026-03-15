// GhostChain Contracts v5.6.1 (contracts/src/l3/LitVybGiftEngine.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title LitVybGiftEngine
/// @notice Processes GST gift transfers from fans to creators on GhostL3.
///         All transactions are enforced to chain 903.
contract LitVybGiftEngine is GhostBrand, GhostReentrancyGuard, GhostOwnable {
    // ─────────────────────────────── errors ────────────────────────────────
    error WrongChain(uint256 expected, uint256 actual);
    error ZeroAmount();
    error InvalidCreator();
    error TransferFailed();

    // ─────────────────────────────── events ────────────────────────────────
    event GiftSent(
        address indexed sender,
        address indexed creator,
        string  giftId,
        uint256 amount,
        uint256 chainId
    );

    // ──────────────────────────── state ────────────────────────────────────
    IGRC20  public immutable GST_TOKEN;
    uint256 public platformFeeBps = 1000; // 10%
    address public feeRecipient;

    mapping(address => uint256) public creatorEarnings;

    constructor(address _gstToken, address _feeRecipient) GhostOwnable(msg.sender) {
        require(_gstToken != address(0), "Invalid GST token");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        GST_TOKEN = IGRC20(_gstToken);
        feeRecipient = _feeRecipient;
    }

    // ───────────────────────────── core ────────────────────────────────────

    /// @notice Send a GST gift to a creator.
    /// @param creator  Recipient creator address.
    /// @param amount   Amount in GST wei (18 decimals).
    /// @param giftId   Off-chain gift identifier (e.g. "dragon").
    function sendGift(
        address creator,
        uint256 amount,
        string calldata giftId
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (amount == 0) revert ZeroAmount();
        if (creator == address(0)) revert InvalidCreator();

        uint256 fee = (amount * platformFeeBps) / 10_000;
        uint256 creatorShare = amount - fee;

        require(
            GST_TOKEN.transferFrom(msg.sender, feeRecipient, fee),
            "Fee transfer failed"
        );
        require(
            GST_TOKEN.transferFrom(msg.sender, creator, creatorShare),
            "Creator transfer failed"
        );

        creatorEarnings[creator] += creatorShare;

        emit GiftSent(msg.sender, creator, giftId, amount, block.chainid);
    }

    // ──────────────────────────── admin ────────────────────────────────────

    function setPlatformFee(uint256 bps) external onlyOwner {
        require(bps <= 3000, "Fee too high"); // max 30%
        platformFeeBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        feeRecipient = recipient;
    }
}
