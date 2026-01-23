// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValidatorComplianceRegistry.sol";

contract DeployValidatorComplianceRegistry is Script {
    function run() external {
        address owner = vm.envAddress("VALIDATOR_REGISTRY_OWNER");
        vm.startBroadcast();
        new ValidatorComplianceRegistry(owner);
        vm.stopBroadcast();
    }
}
