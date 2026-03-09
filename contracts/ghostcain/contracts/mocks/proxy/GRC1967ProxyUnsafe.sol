// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import {GRC1967Proxy} from "../../proxy/GRC1967/GRC1967Proxy.sol";

contract GRC1967ProxyUnsafe is GRC1967Proxy {
    constructor(address implementation, bytes memory _data) payable GRC1967Proxy(implementation, _data) {}

    function _unsafeAllowUninitialized() internal pure override returns (bool) {
        return true;
    }
}
