// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

contract MockDisputeGameFactory {
    event GameCreated(uint32 indexed gameType, bytes extraData, address gameProxy);

    function version() external pure returns (string memory) {
        return "1.0.0-mock";
    }

    function create(uint32 gameType, bytes calldata extraData) external returns (address) {
        // No-op stub; in production this would deploy a dispute game.
        emit GameCreated(gameType, extraData, address(0));
        return address(0);
    }
}
