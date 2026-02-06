// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/l1/Treasury.sol";
import "../../src/l1/NativeToken.sol";

contract TreasuryEchidna {
    NativeToken private token;
    Treasury private treasury;

    constructor() payable {
        token = new NativeToken("Ghost", "GHOST");
        treasury = new Treasury(token);
        payable(address(treasury)).transfer(1 ether);
        token.mint(address(treasury), 1000 ether);
    }

    function echidna_cannot_overdraw_gst() public returns (bool) {
        try treasury.withdrawETH(payable(address(this)), 2 ether) {
            return false;
        } catch {
            return true;
        }
    }
}
