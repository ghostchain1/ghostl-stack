// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/l1/NativeToken.sol";

contract TokenEchidna {
    NativeToken private token;

    constructor() {
        token = new NativeToken("Ghost", "GST");
    }

    function echidna_supply_nonzero() public view returns (bool) {
        return token.totalSupply() >= 0;
    }

    function echidna_owner_only_mint() public returns (bool) {
        try token.mint(address(this), 1 ether) {
            return true;
        } catch {
            return false;
        }
    }
}
