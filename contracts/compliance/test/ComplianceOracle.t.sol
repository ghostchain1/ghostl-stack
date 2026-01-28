// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ComplianceOracle.sol";

contract ComplianceOracleTest is Test {
    ComplianceOracle oracle;

    uint256 signerPk;
    address signerAddr;

    function setUp() public {
        signerPk = 0xA11CE;
        signerAddr = vm.addr(signerPk);
        oracle = new ComplianceOracle(signerAddr);
    }

    function testValidAttestation() public {
        address subject = address(0xBEEF);
        bytes32 action = keccak256("TRANSFER");
        bytes32 paramsHash = keccak256(abi.encodePacked("to", address(0xCAFE), uint256(123)));
        uint256 expiry = block.timestamp + 300;

        bytes32 digest = keccak256(abi.encodePacked(subject, action, paramsHash, expiry, block.chainid));
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSigned);
        bytes memory sig = abi.encodePacked(r, s, v);

        bool ok = oracle.isValidAttestation(subject, action, paramsHash, expiry, sig);
        assertTrue(ok);
    }

    function testExpiredAttestationFails() public {
        address subject = address(0xBEEF);
        bytes32 action = keccak256("TRANSFER");
        bytes32 paramsHash = keccak256("x");
        uint256 expiry = block.timestamp - 1;

        bytes memory sig = hex"";
        bool ok = oracle.isValidAttestation(subject, action, paramsHash, expiry, sig);
        assertFalse(ok);
    }
}
