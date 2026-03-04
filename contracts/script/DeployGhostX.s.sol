// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/exchange/GhostXFeeCollector.sol";
import "../src/exchange/GhostXVault.sol";
import "../src/exchange/GhostXOrderBook.sol";

/// @notice Deploy the Ghost X order book stack to GhostChain L2.
///
/// Usage (dry-run):
///   forge script script/DeployGhostX.s.sol --rpc-url $L2_RPC_URL --broadcast --sender $DEPLOYER
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  – deployment account key
///   TREASURY              – address that will receive protocol fees
///   L2_RPC_URL            – GhostChain L2 JSON-RPC endpoint
contract DeployGhostX is Script {
    function run() external {
        address deployer  = vm.envAddress("DEPLOYER");
        address treasury  = vm.envAddress("TREASURY");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // 1. Fee collector (sweeper = treasury).
        GhostXFeeCollector feeCollector = new GhostXFeeCollector(treasury);
        console.log("GhostXFeeCollector:", address(feeCollector));

        // 2. Vault (only the order book may lock/settle funds).
        //    We deploy a placeholder first, then set the real address.
        //    Two-step: deploy vault with a temp address, then redeploy with book address.
        //    For simplicity we predict the order book address via nonce arithmetic.
        uint64 nonce = vm.getNonce(deployer);
        address predictedBook = _computeCreate(deployer, nonce + 1);

        GhostXVault vault = new GhostXVault(predictedBook);
        console.log("GhostXVault:", address(vault));

        // 3. Order book.
        GhostXOrderBook book = new GhostXOrderBook(address(vault), address(feeCollector));
        console.log("GhostXOrderBook:", address(book));

        require(address(book) == predictedBook, "nonce prediction off");

        // 4. Wire fee collector → order book.
        feeCollector.setOrderBook(address(book));

        vm.stopBroadcast();

        // Dump addresses for downstream tooling.
        string memory json = string.concat(
            '{"feeCollector":"', vm.toString(address(feeCollector)),
            '","vault":"',       vm.toString(address(vault)),
            '","orderBook":"',   vm.toString(address(book)),
            '"}'
        );
        vm.writeFile("./deployments/ghostx-l2.json", json);
        console.log("Addresses written to deployments/ghostx-l2.json");
    }

    /// @dev Compute CREATE address for a contract deployed by `deployer` at `nonce`.
    function _computeCreate(address deployer_, uint64 nonce_) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xd6), bytes1(0x94), deployer_, bytes1(uint8(nonce_))
        )))));
    }
}
