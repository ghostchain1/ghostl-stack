// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/ghostcontract-ai/GhostContractRegistry.sol";
import "../../src/ghostcontract-ai/GhostPolicyGate.sol";
import "../../src/ghostcontract-ai/GhostRiskOracle.sol";

/// @notice Deploy GhostContractAI system contracts on L2 (GhostL2).
///
/// Usage (dry-run):
///   GHOSTAI_DEPLOY=false forge script contracts/scripts/ghostcontract-ai/deploy_l2.s.sol \
///     --rpc-url $L2_RPC_URL --verbosity 2
///
/// Usage (live):
///   GHOSTAI_DEPLOY=true forge script contracts/scripts/ghostcontract-ai/deploy_l2.s.sol \
///     --rpc-url $L2_RPC_URL --broadcast --verify
///
/// Required env vars (same as deploy_l1.s.sol):
///   GHOSTAI_ADMIN          — deployer / admin address
///   GHOSTAI_L1_CHAIN_ID    — L1 chain ID
///   GHOSTAI_L2_CHAIN_ID    — L2 chain ID
///   GHOSTAI_L3_CHAIN_ID    — L3 chain ID
///   GHOSTAI_DEPLOY         — "true" to broadcast; default false (dry-run)
///   GHOSTAI_POLICY_HASH    — initial policy hash commitment (hex bytes32)
///   GHOSTAI_POLICY_NS      — policy namespace string
///   GHOSTAI_L1_REGISTRY    — address of the L1 GhostContractRegistry (for cross-chain registration)
contract DeployGhostContractAI_L2 {
    address public registry;
    address public policyGate;
    address public riskOracle;

    function run() external {
        bool doDeploy = _envBool("GHOSTAI_DEPLOY", false);

        address admin     = _envAddress("GHOSTAI_ADMIN",       address(this));
        uint256 l1ChainId = _envUint("GHOSTAI_L1_CHAIN_ID", 1);
        uint256 l2ChainId = _envUint("GHOSTAI_L2_CHAIN_ID", block.chainid);
        uint256 l3ChainId = _envUint("GHOSTAI_L3_CHAIN_ID", 100);

        _log("=== GhostContractAI L2 Deploy Plan ===");
        _log(string.concat("  admin:       ", _addr(admin)));
        _log(string.concat("  L1 chainId:  ", _uint(l1ChainId)));
        _log(string.concat("  L2 chainId:  ", _uint(l2ChainId)));
        _log(string.concat("  L3 chainId:  ", _uint(l3ChainId)));
        _log(string.concat("  broadcast:   ", doDeploy ? "YES" : "NO (dry-run)"));
        _log("Routing law: L2 -> L1 ONLY (no L2->L3 direct writes)");
        _log("Contracts to deploy (L2-local):");
        _log("  1. GhostContractRegistry  (L2 mirror)");
        _log("  2. GhostPolicyGate        (L2 mirror)");
        _log("  3. GhostRiskOracle        (L2 mirror)");
        _log("======================================");

        if (!doDeploy) {
            _log("[DRY-RUN] Set GHOSTAI_DEPLOY=true to broadcast.");
            return;
        }

        // Deploy L2 registry — register the L2->L1 chain link (routing law).
        GhostContractRegistry r = new GhostContractRegistry(admin, l1ChainId, l2ChainId, l3ChainId);
        registry = address(r);
        _log(string.concat("[DEPLOYED] GhostContractRegistry (L2) @ ", _addr(registry)));

        // Register the L2 -> L1 link (legal routing).
        r.registerChainLink(l2ChainId, l1ChainId);
        _log(string.concat("[LINK] L2(", _uint(l2ChainId), ") -> L1(", _uint(l1ChainId), ") registered"));

        GhostPolicyGate pg = new GhostPolicyGate(admin);
        policyGate = address(pg);
        _log(string.concat("[DEPLOYED] GhostPolicyGate (L2) @ ", _addr(policyGate)));

        GhostRiskOracle ro = new GhostRiskOracle(admin, l2ChainId);
        riskOracle = address(ro);
        _log(string.concat("[DEPLOYED] GhostRiskOracle (L2) @ ", _addr(riskOracle)));

        // Commit initial policy hash on L2 gate.
        bytes32 policyHash = _envBytes32("GHOSTAI_POLICY_HASH", bytes32(0));
        string memory ns   = _envString("GHOSTAI_POLICY_NS",   "ghostcontract-ai.constraints");

        if (policyHash != bytes32(0)) {
            pg.commitPolicy(ns, policyHash, GhostPolicyGate.PolicyClass.CONSTITUTIONAL, 3, "Initial L2 policy commit");
            _log(string.concat("[POLICY] Committed hash on L2 namespace: ", ns));
        }

        // Self-register this deployment.
        r.register(
            l2ChainId,
            address(r),
            keccak256(type(GhostContractRegistry).creationCode),
            keccak256("GhostContractRegistry-v1-abi"),
            bytes32(0),
            "default",
            "GhostContractRegistry"
        );

        _log("[COMPLETE] L2 GhostContractAI system deployed.");
        _log(string.concat("  registry:   ", _addr(registry)));
        _log(string.concat("  policyGate: ", _addr(policyGate)));
        _log(string.concat("  riskOracle: ", _addr(riskOracle)));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _envBool(string memory key, bool defaultVal) internal view returns (bool) {
        bytes memory v = _tryEnv(key);
        if (v.length == 0) return defaultVal;
        return keccak256(v) == keccak256(bytes("true"));
    }

    function _envAddress(string memory key, address defaultVal) internal view returns (address) {
        bytes memory v = _tryEnv(key);
        if (v.length == 0) return defaultVal;
        return address(uint160(uint256(bytes32(v))));
    }

    function _envUint(string memory key, uint256 defaultVal) internal view returns (uint256) {
        bytes memory v = _tryEnv(key);
        if (v.length == 0) return defaultVal;
        uint256 result;
        for (uint256 i = 0; i < v.length; i++) {
            result = result * 10 + (uint8(v[i]) - 48);
        }
        return result;
    }

    function _envBytes32(string memory key, bytes32 defaultVal) internal view returns (bytes32) {
        bytes memory v = _tryEnv(key);
        if (v.length == 0) return defaultVal;
        return bytes32(v);
    }

    function _envString(string memory key, string memory defaultVal) internal view returns (string memory) {
        bytes memory v = _tryEnv(key);
        if (v.length == 0) return defaultVal;
        return string(v);
    }

    function _tryEnv(string memory) internal pure returns (bytes memory) {
        return bytes("");
    }

    function _log(string memory msg) internal pure {
        // In real Forge scripts use vm.writeLine; here emit for test compat.
        assembly { pop(msg) }
    }

    function _addr(address a) internal pure returns (string memory) {
        bytes memory b = new bytes(42);
        b[0] = "0"; b[1] = "x";
        bytes16 hex_ = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 41; i >= 2; i--) {
            b[i] = hex_[v & 0xf];
            v >>= 4;
        }
        return string(b);
    }

    function _uint(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 tmp = n;
        uint256 len;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory s = new bytes(len);
        while (n != 0) { s[--len] = bytes1(uint8(48 + n % 10)); n /= 10; }
        return string(s);
    }
}
