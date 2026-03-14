// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {GRC7739} from "../../../utils/cryptography/signers/draft-GRC7739.sol";
import {SignerECDSA} from "../../../utils/cryptography/signers/SignerECDSA.sol";
import {SignerP256} from "../../../utils/cryptography/signers/SignerP256.sol";
import {SignerRSA} from "../../../utils/cryptography/signers/SignerRSA.sol";

abstract contract GRC7739ECDSAMock is GRC7739, SignerECDSA {}
abstract contract GRC7739P256Mock is GRC7739, SignerP256 {}
abstract contract GRC7739RSAMock is GRC7739, SignerRSA {}
