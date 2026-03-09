// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";

contract GRC20WithAutoMinerReward is GRC20 {
    constructor() GRC20("Reward", "RWD") {
        _mintMinerReward();
    }

    function _mintMinerReward() internal {
        _mint(block.coinbase, 1000);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (!(from == address(0) && to == block.coinbase)) {
            _mintMinerReward();
        }
        super._update(from, to, value);
    }
}
