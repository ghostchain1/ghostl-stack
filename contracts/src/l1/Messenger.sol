// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Ownable.sol";

/// @notice Lightweight message inbox/outbox for devnet bridging demos.
// slither-disable-next-line locked-ether
contract Messenger is Ownable {
    struct QueuedMessage {
        address from;
        address to;
        bytes data;
        uint256 value;
        uint256 timestamp;
    }

    QueuedMessage[] public sentMessages;
    QueuedMessage[] public relayedMessages;

    event MessageQueued(uint256 indexed id, address indexed from, address indexed to, bytes data, uint256 value);
    event MessageRelayed(uint256 indexed id, address indexed to);

    function sendMessage(address to, bytes calldata data) external payable returns (uint256) {
        uint256 id = sentMessages.length;
        sentMessages.push(QueuedMessage(msg.sender, to, data, msg.value, block.timestamp));
        emit MessageQueued(id, msg.sender, to, data, msg.value);
        return id;
    }

    function relayMessage(uint256 id) external onlyOwner {
        require(id < sentMessages.length, "bad id");
        QueuedMessage memory m = sentMessages[id];
        relayedMessages.push(m);
        emit MessageRelayed(id, m.to);
    }

    function sentCount() external view returns (uint256) {
        return sentMessages.length;
    }

    function relayedCount() external view returns (uint256) {
        return relayedMessages.length;
    }
}
