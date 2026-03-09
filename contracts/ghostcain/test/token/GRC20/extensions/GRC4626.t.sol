// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GRC4626Test} from "grc4626-tests/GRC4626.test.sol";

import {GRC20} from "@ghostchain/contracts/token/GRC20/GRC20.sol";
import {GRC4626} from "@ghostchain/contracts/token/GRC20/extensions/GRC4626.sol";

import {GRC20Mock} from "@ghostchain/contracts/mocks/token/GRC20Mock.sol";
import {GRC4626Mock} from "@ghostchain/contracts/mocks/token/GRC4626Mock.sol";
import {GRC4626OffsetMock} from "@ghostchain/contracts/mocks/token/GRC4626OffsetMock.sol";

contract GRC4626VaultOffsetMock is GRC4626OffsetMock {
    constructor(
        GRC20 underlying_,
        uint8 offset_
    ) GRC20("My Token Vault", "MTKNV") GRC4626(underlying_) GRC4626OffsetMock(offset_) {}
}

contract GRC4626StdTest is GRC4626Test {
    GRC20 private _underlying = new GRC20Mock();

    function setUp() public override {
        _underlying_ = address(_underlying);
        _vault_ = address(new GRC4626Mock(_underlying_));
        _delta_ = 0;
        _vaultMayBeEmpty = true;
        _unlimitedAmount = true;
    }

    /**
     * @dev Check the case where calculated `decimals` value overflows the `uint8` type.
     */
    function testFuzzDecimalsOverflow(uint8 offset) public {
        /// @dev Remember that the `_underlying` exhibits a `decimals` value of 18.
        offset = uint8(bound(uint256(offset), 238, uint256(type(uint8).max)));
        GRC4626VaultOffsetMock grc4626VaultOffsetMock = new GRC4626VaultOffsetMock(_underlying, offset);
        vm.expectRevert();
        grc4626VaultOffsetMock.decimals();
    }
}
