// GhostChain Contracts v5.6.1 (contracts/src/l3/SettlementEngine.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title SettlementEngine
/// @notice Batch real-time settlement ledger for GhostL3 micro-transactions.
contract SettlementEngine is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    error WrongChain(uint256 expected, uint256 actual);
    error BatchTooLarge(uint256 size, uint256 max);
    error SessionAlreadySettled(bytes32 sessionId);

    uint256 public constant MAX_BATCH = 100;

    IGRC20 public immutable GST_TOKEN;

    struct Settlement {
        address recipient;
        uint256 amount;
        bytes32 sessionId;
    }

    mapping(bytes32 => bool) public settled;

    event BatchSettled(bytes32 indexed firstSessionId, uint256 count, uint256 totalAmount);
    event OperatorSet(address indexed operator, bool active);

    mapping(address => bool) public operators;

    constructor(address _gstToken, address _owner) GhostOwnable(_owner) {
        require(_gstToken != address(0), "Invalid GST");
        GST_TOKEN = IGRC20(_gstToken);
    }

    function setOperator(address op, bool active) external onlyOwner {
        operators[op] = active;
        emit OperatorSet(op, active);
    }

    function settleBatch(Settlement[] calldata items) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        require(operators[msg.sender] || msg.sender == owner(), "Not operator");
        if (items.length > MAX_BATCH) revert BatchTooLarge(items.length, MAX_BATCH);

        uint256 total;
        for (uint256 i; i < items.length;) {
            bytes32 sid = items[i].sessionId;
            if (settled[sid]) revert SessionAlreadySettled(sid);
            settled[sid] = true;
            total += items[i].amount;
            require(GST_TOKEN.transfer(items[i].recipient, items[i].amount), "Transfer failed");
            unchecked { ++i; }
        }

        emit BatchSettled(items.length > 0 ? items[0].sessionId : bytes32(0), items.length, total);
    }

    function deposit(uint256 amount) external onlyOwner {
        require(GST_TOKEN.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }
}
