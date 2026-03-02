// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/// @notice Verifies the canonical gas token instead of deploying a new one.
contract DeployGasToken is Script {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    function run() external {
        address configured = vm.envOr("CUSTOM_GAS_TOKEN_ADDRESS", CANONICAL_GAS_TOKEN);
        if (configured != CANONICAL_GAS_TOKEN) {
            revert("non-canonical gas token");
        }
        uint256 codeSize = configured.code.length;
        if (codeSize == 0) {
            revert("canonical gas token missing");
        }
        console2.log("ChainId", block.chainid);
        console2.log("CanonicalGasToken", configured);
        console2.log("CanonicalGasTokenCodeSize", codeSize);
    }
}
