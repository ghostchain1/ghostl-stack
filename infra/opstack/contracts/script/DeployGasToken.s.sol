// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../GasToken.sol";

/// @notice Deploys a standalone GasToken ERC20 to the configured RPC.
contract DeployGasToken is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        string memory name = vm.envOr("GAS_TOKEN_NAME", string("Ghost Token"));
        string memory symbol = vm.envOr("GAS_TOKEN_SYMBOL", string("GHOST"));
        uint8 decimals = uint8(vm.envOr("GAS_TOKEN_DECIMALS", uint256(18)));
        uint256 supply = vm.envOr("GAS_TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000 ether));
        address recipient = vm.envOr("GAS_TOKEN_RECIPIENT", deployer);
        console2.log("ChainId", block.chainid);
        console2.log("Block gas limit", block.gaslimit);

        vm.startBroadcast(pk);
        GasToken token = new GasToken(name, symbol, decimals, supply, recipient);
        vm.stopBroadcast();

        console2.log("Deployer", deployer);
        console2.log("GasToken", address(token));
    }
}
