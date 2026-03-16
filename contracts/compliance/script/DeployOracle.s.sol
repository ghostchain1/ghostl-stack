// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ComplianceOracle.sol";

contract DeployOracle is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address signer = vm.envAddress("COMPLIANCE_SIGNER");
        vm.startBroadcast(deployerKey);
        new ComplianceOracle(signer);
        vm.stopBroadcast();
    }
}
