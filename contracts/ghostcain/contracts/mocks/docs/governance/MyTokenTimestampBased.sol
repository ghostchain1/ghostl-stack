// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GRC20} from "../../../token/GRC20/GRC20.sol";
import {GRC20Permit} from "../../../token/GRC20/extensions/GRC20Permit.sol";
import {GRC20Votes} from "../../../token/GRC20/extensions/GRC20Votes.sol";
import {Nonces} from "../../../utils/Nonces.sol";

contract MyTokenTimestampBased is GRC20, GRC20Permit, GRC20Votes {
    constructor() GRC20("MyTokenTimestampBased", "MTK") GRC20Permit("MyTokenTimestampBased") {}

    // Overrides IGRC6372 functions to make the token & governor timestamp-based

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // The functions below are overrides required by Solidity.

    function _update(address from, address to, uint256 amount) internal override(GRC20, GRC20Votes) {
        super._update(from, to, amount);
    }

    function nonces(address owner) public view virtual override(GRC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
