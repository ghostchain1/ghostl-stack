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
        payable(address(treasury)).transfer(1e18);
        token.mint(address(treasury), 1000e18);
    }

    function echidna_cannot_overdraw_gst() public returns (bool) {
        try treasury.withdrawLegacyValue(payable(address(this)), 2e18) {
            return false;
        } catch {
            return true;
        }
    }
}
