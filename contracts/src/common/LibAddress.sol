// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LibAddress {
    function isContract(address a) internal view returns (bool) {
        return a.code.length > 0;
    }
}
