// GhostChain Contracts v5.6.1 (contracts/src/l3/GamePool.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title GamePool
/// @notice Collects GST entry fees and distributes prize pools for live games on GhostL3.
contract GamePool is GhostBrand, GhostReentrancyGuard, GhostOwnable {
    error WrongChain(uint256 expected, uint256 actual);
    error GameNotFound(bytes32 gameId);
    error GameClosed(bytes32 gameId);
    error TransferFailed();
    error Unauthorized();

    event GameCreated(bytes32 indexed gameId, string name, uint256 entryFee);
    event PlayerJoined(bytes32 indexed gameId, address player, uint256 entryFee);
    event PrizeDistributed(bytes32 indexed gameId, address winner, uint256 prize);

    IGRC20 public immutable GST_TOKEN;
    uint256 public platformFeeBps = 500; // 5%
    address public feeRecipient;

    struct Game {
        string  name;
        uint256 entryFee;
        uint256 prizePool;
        bool    isOpen;
        address operator;
    }

    mapping(bytes32 => Game) public games;

    constructor(address _gstToken, address _feeRecipient) GhostOwnable(msg.sender) {
        GST_TOKEN = IGRC20(_gstToken);
        feeRecipient = _feeRecipient;
    }

    function createGame(
        bytes32 gameId,
        string calldata name,
        uint256 entryFee
    ) external onlyOwner {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        games[gameId] = Game({
            name: name,
            entryFee: entryFee,
            prizePool: 0,
            isOpen: true,
            operator: msg.sender
        });
        emit GameCreated(gameId, name, entryFee);
    }

    function joinGame(bytes32 gameId) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        Game storage g = games[gameId];
        if (g.entryFee == 0 && !g.isOpen) revert GameNotFound(gameId);
        if (!g.isOpen) revert GameClosed(gameId);

        uint256 fee = (g.entryFee * platformFeeBps) / 10_000;
        uint256 poolContribution = g.entryFee - fee;

        require(GST_TOKEN.transferFrom(msg.sender, feeRecipient, fee), "Fee failed");
        require(GST_TOKEN.transferFrom(msg.sender, address(this), poolContribution), "Entry failed");

        g.prizePool += poolContribution;
        emit PlayerJoined(gameId, msg.sender, g.entryFee);
    }

    function distributePrize(bytes32 gameId, address winner) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        Game storage g = games[gameId];
        if (msg.sender != g.operator && msg.sender != owner()) revert Unauthorized();
        g.isOpen = false;
        uint256 prize = g.prizePool;
        g.prizePool = 0;
        require(GST_TOKEN.transfer(winner, prize), "Prize transfer failed");
        emit PrizeDistributed(gameId, winner, prize);
    }
}
