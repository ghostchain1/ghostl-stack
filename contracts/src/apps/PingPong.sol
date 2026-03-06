// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import {IXDomainMessenger} from "../common/IXDomainMessenger.sol";

contract PingPong {
    event GotMessage(address indexed messenger, address indexed xSender, string text);

    IXDomainMessenger public messenger;

    constructor(address _messenger) {
        messenger = IXDomainMessenger(_messenger);
    }

    function sendPing(address targetOnParent, string calldata text, uint32 minGasLimit) external {
        bytes memory msgData = abi.encodeCall(PingPong.receiveMessage, (text));
        messenger.sendMessage(targetOnParent, msgData, minGasLimit);
    }

    function receiveMessage(string calldata text) external {
        // Only accept via messenger relay.
        require(msg.sender == address(messenger), "not messenger");
        address xSender = messenger.xDomainMessageSender();
        emit GotMessage(msg.sender, xSender, text);
    }
}
