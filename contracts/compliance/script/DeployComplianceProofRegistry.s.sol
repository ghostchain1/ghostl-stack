// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ComplianceProofRegistry.sol";

contract DeployComplianceProofRegistry is Script {
    function run() external {
        address owner = vm.envAddress("COMPLIANCE_REGISTRY_OWNER");
        vm.startBroadcast();
        new ComplianceProofRegistry(owner);
        vm.stopBroadcast();
    }
}
