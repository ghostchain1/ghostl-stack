// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGRC20, GRC20} from "../../../token/GRC20/GRC20.sol";
import {GRC20Permit} from "../../../token/GRC20/extensions/GRC20Permit.sol";
import {GRC20Votes} from "../../../token/GRC20/extensions/GRC20Votes.sol";
import {GRC20Wrapper} from "../../../token/GRC20/extensions/GRC20Wrapper.sol";
import {Nonces} from "../../../utils/Nonces.sol";

contract MyTokenWrapped is GRC20, GRC20Permit, GRC20Votes, GRC20Wrapper {
    constructor(
        IGRC20 wrappedToken
    ) GRC20("MyTokenWrapped", "MTK") GRC20Permit("MyTokenWrapped") GRC20Wrapper(wrappedToken) {}

    // The functions below are overrides required by Solidity.

    function decimals() public view override(GRC20, GRC20Wrapper) returns (uint8) {
        return super.decimals();
    }

    function _update(address from, address to, uint256 amount) internal override(GRC20, GRC20Votes) {
        super._update(from, to, amount);
    }

    function nonces(address owner) public view virtual override(GRC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
