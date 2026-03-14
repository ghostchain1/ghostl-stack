// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (vendor/WGST9.sol)

pragma solidity ^0.8.24;

import {IWGST9} from "../interfaces/IWGST9.sol";
import {GRC20} from "../token/GRC20/GRC20.sol";

/**
 * @dev Wrapped GST 9 — the canonical GhostChain native-token wrapper.
 *
 * Deposits native GST and mints an equal amount of WGST; burns WGST and returns GST 1:1.
 * Fully compatible with the {IGRC20} interface and drop-in equivalent to the upstream
 * WETH9 contract for tooling that expects a wrapped-native-token.
 *
 * @custom:security-contact security@ghostchain.io
 */
contract WGST9 is GRC20("Wrapped GST", "WGST"), IWGST9 {
    /**
     * @dev Deposit native GST; mints WGST to `msg.sender`.
     *
     * Emits a {Deposit} event.
     */
    function deposit() public payable virtual {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Burn `wad` WGST from `msg.sender` and return native GST 1:1.
     *
     * Emits a {Withdrawal} event.
     */
    function withdraw(uint256 wad) public virtual {
        _burn(msg.sender, wad);
        emit Withdrawal(msg.sender, wad);
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "WGST9: GST transfer failed");
    }

    /**
     * @dev Accept native GST sent directly to the contract; proxies to {deposit}.
     */
    receive() external payable virtual {
        deposit();
    }
}
