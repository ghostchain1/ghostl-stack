// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../patched/token/GRC20/GRC20.sol";
import "../patched/token/GRC20/extensions/GRC20Permit.sol";
import "../patched/token/GRC20/extensions/GRC20FlashMint.sol";

contract GRC20FlashMintHarness is GRC20, GRC20Permit, GRC20FlashMint {
    uint256 someFee;
    address someFeeReceiver;

    constructor(string memory name, string memory symbol) GRC20(name, symbol) GRC20Permit(name) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    // public accessor
    function flashFeeReceiver() public view returns (address) {
        return someFeeReceiver;
    }

    // internal hook
    function _flashFee(address, uint256) internal view override returns (uint256) {
        return someFee;
    }

    function _flashFeeReceiver() internal view override returns (address) {
        return someFeeReceiver;
    }
}
