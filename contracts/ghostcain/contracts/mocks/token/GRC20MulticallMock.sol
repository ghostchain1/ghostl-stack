// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";
import {Multicall} from "../../utils/Multicall.sol";

abstract contract GRC20MulticallMock is GRC20, Multicall {}
