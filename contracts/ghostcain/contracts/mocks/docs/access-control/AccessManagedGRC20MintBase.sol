// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessManaged} from "../../../access/manager/AccessManaged.sol";
import {GRC20} from "../../../token/GRC20/GRC20.sol";

contract AccessManagedGRC20Mint is GRC20, AccessManaged {
    constructor(address manager) GRC20("MyToken", "TKN") AccessManaged(manager) {}

    // Minting is restricted according to the manager rules for this function.
    // The function is identified by its selector: 0x40c10f19.
    // Calculated with bytes4(keccak256('mint(address,uint256)'))
    function mint(address to, uint256 amount) public restricted {
        _mint(to, amount);
    }
}
