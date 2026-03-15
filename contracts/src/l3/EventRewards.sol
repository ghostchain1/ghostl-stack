// GhostChain Contracts v5.6.1 (contracts/src/l3/EventRewards.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";

/// @title EventRewards
/// @notice Tournament and live-event prize pool funding and distribution on GhostL3.
contract EventRewards is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    error WrongChain(uint256 expected, uint256 actual);
    error EventNotFound(bytes32 eventId);
    error EventFinished(bytes32 eventId);
    error ArrayMismatch();
    error NotOperator();

    IGRC20 public immutable GST_TOKEN;

    struct Event {
        uint256 rewardPool;
        uint256 distributed;
        bool    active;
    }

    mapping(bytes32 => Event) public events;
    mapping(address => bool) public operators;

    event EventCreated(bytes32 indexed eventId, uint256 rewardPool);
    event PrizesDistributed(bytes32 indexed eventId, uint256 count, uint256 totalDistributed);
    event EventClosed(bytes32 indexed eventId);
    event OperatorSet(address indexed op, bool active);

    constructor(address _gstToken, address _owner) GhostOwnable(_owner) {
        require(_gstToken != address(0), "Invalid GST");
        GST_TOKEN = IGRC20(_gstToken);
    }

    function setOperator(address op, bool active) external onlyOwner {
        operators[op] = active;
        emit OperatorSet(op, active);
    }

    function createEvent(bytes32 eventId, uint256 rewardPool) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        require(!events[eventId].active, "Event exists");
        require(GST_TOKEN.transferFrom(msg.sender, address(this), rewardPool), "Fund failed");
        events[eventId] = Event({rewardPool: rewardPool, distributed: 0, active: true});
        emit EventCreated(eventId, rewardPool);
    }

    function distributePrizes(
        bytes32 eventId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (!operators[msg.sender] && msg.sender != owner()) revert NotOperator();
        if (winners.length != amounts.length) revert ArrayMismatch();

        Event storage ev = events[eventId];
        if (ev.rewardPool == 0) revert EventNotFound(eventId);
        if (!ev.active) revert EventFinished(eventId);

        uint256 total;
        for (uint256 i; i < winners.length;) {
            total += amounts[i];
            require(GST_TOKEN.transfer(winners[i], amounts[i]), "Prize transfer failed");
            unchecked { ++i; }
        }

        ev.distributed += total;
        require(ev.distributed <= ev.rewardPool, "Exceeds pool");

        emit PrizesDistributed(eventId, winners.length, total);
    }

    function closeEvent(bytes32 eventId) external onlyOwner {
        Event storage ev = events[eventId];
        if (ev.rewardPool == 0) revert EventNotFound(eventId);
        ev.active = false;
        // Return undistributed GST to owner
        uint256 remaining = ev.rewardPool - ev.distributed;
        if (remaining > 0) {
            require(GST_TOKEN.transfer(owner(), remaining), "Refund failed");
        }
        emit EventClosed(eventId);
    }
}
