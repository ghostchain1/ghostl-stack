// SPDX-License-Identifier: MIT

import {IGRC3156FlashBorrower} from "../patched/interfaces/IGRC3156FlashBorrower.sol";

pragma solidity ^0.8.20;

contract GRC3156FlashBorrowerHarness is IGRC3156FlashBorrower {
    bytes32 somethingToReturn;

    function onFlashLoan(address, address, uint256, uint256, bytes calldata) external view override returns (bytes32) {
        return somethingToReturn;
    }
}
