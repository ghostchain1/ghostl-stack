// GhostChain Contracts v5.6.1 (contracts/src/l3/CreatorPayout.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";

/// @title CreatorPayout
/// @notice Creator withdrawal portal with GhostL3 chain enforcement.
///         Creators request payouts; operators (or settlement engine) process them in batch.
contract CreatorPayout is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    error WrongChain(uint256 expected, uint256 actual);
    error InsufficientPendingBalance(uint256 pending, uint256 requested);
    error ArrayMismatch();
    error NotOperator();

    IGRC20 public immutable GST_TOKEN;

    mapping(address => uint256) public pendingPayout;
    mapping(address => bool) public operators;

    event PayoutRequested(address indexed creator, uint256 amount);
    event PayoutsProcessed(address[] creators, uint256[] amounts, uint256 total);
    event OperatorSet(address indexed op, bool active);

    constructor(address _gstToken, address _owner) GhostOwnable(_owner) {
        require(_gstToken != address(0), "Invalid GST");
        GST_TOKEN = IGRC20(_gstToken);
    }

    function setOperator(address op, bool active) external onlyOwner {
        operators[op] = active;
        emit OperatorSet(op, active);
    }

    /// @notice Credit pending earnings into this contract (called by revenue/gift contracts).
    function creditEarning(address creator, uint256 amount) external {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        require(operators[msg.sender] || msg.sender == owner(), "Not operator");
        require(GST_TOKEN.transferFrom(msg.sender, address(this), amount), "Credit failed");
        pendingPayout[creator] += amount;
    }

    /// @notice Creator queues a withdrawal request.
    function requestPayout(uint256 amount) external {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        uint256 pending = pendingPayout[msg.sender];
        if (pending < amount) revert InsufficientPendingBalance(pending, amount);
        // Deduct immediately; operator must call processPayouts to release GST.
        pendingPayout[msg.sender] -= amount;
        pendingPayout[address(this)] += amount; // park in contract slot
        emit PayoutRequested(msg.sender, amount);
    }

    /// @notice Operator processes batch payouts (send GST to creators).
    function processPayouts(
        address[] calldata creators,
        uint256[] calldata amounts
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (!operators[msg.sender] && msg.sender != owner()) revert NotOperator();
        if (creators.length != amounts.length) revert ArrayMismatch();

        uint256 total;
        for (uint256 i; i < creators.length;) {
            require(GST_TOKEN.transfer(creators[i], amounts[i]), "Payout failed");
            total += amounts[i];
            unchecked { ++i; }
        }

        emit PayoutsProcessed(creators, amounts, total);
    }

    /// @notice Fund contract with GST for payouts.
    function fund(uint256 amount) external onlyOwner {
        require(GST_TOKEN.transferFrom(msg.sender, address(this), amount), "Fund failed");
    }
}
