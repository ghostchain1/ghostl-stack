// GhostChain Contracts v5.6.1 (contracts/src/l3/GiftBatchProcessor.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title GiftBatchProcessor
/// @notice Batches multiple GST gift transfers in a single transaction on GhostL3.
///         Reduces gas overhead for high-frequency microtransactions.
contract GiftBatchProcessor is GhostBrand, GhostReentrancyGuard, GhostOwnable {
    error WrongChain(uint256 expected, uint256 actual);
    error EmptyBatch();
    error BatchTooLarge(uint256 max, uint256 actual);
    error TransferFailed();

    event BatchProcessed(address indexed sender, uint256 count, uint256 totalAmount);

    IGRC20 public immutable GST_TOKEN;
    uint256 public constant MAX_BATCH = 50;
    uint256 public platformFeeBps = 800; // 8%
    address public feeRecipient;

    struct GiftItem {
        address creator;
        uint256 amount;
        string  giftId;
    }

    constructor(address _gstToken, address _feeRecipient) GhostOwnable(msg.sender) {
        require(_gstToken != address(0), "Invalid GST");
        GST_TOKEN = IGRC20(_gstToken);
        feeRecipient = _feeRecipient;
    }

    function processBatch(GiftItem[] calldata items) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (items.length == 0) revert EmptyBatch();
        if (items.length > MAX_BATCH) revert BatchTooLarge(MAX_BATCH, items.length);

        uint256 totalAmount;
        for (uint256 i; i < items.length; ) {
            GiftItem calldata g = items[i];
            require(g.creator != address(0), "Invalid creator");
            require(g.amount > 0, "Zero amount");
            uint256 fee = (g.amount * platformFeeBps) / 10_000;
            uint256 creatorShare = g.amount - fee;
            require(GST_TOKEN.transferFrom(msg.sender, feeRecipient, fee), "Fee failed");
            require(GST_TOKEN.transferFrom(msg.sender, g.creator, creatorShare), "Transfer failed");
            totalAmount += g.amount;
            unchecked { ++i; }
        }
        emit BatchProcessed(msg.sender, items.length, totalAmount);
    }

    function setFee(uint256 bps) external onlyOwner {
        require(bps <= 2000, "Max 20%");
        platformFeeBps = bps;
    }
}
