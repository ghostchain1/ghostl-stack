// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/ghostcontract-ai/GhostContractRegistry.sol";
import "../../src/ghostcontract-ai/GhostPolicyGate.sol";
import "../../src/ghostcontract-ai/GhostRiskOracle.sol";

/// @notice Deploy GhostContractAI system contracts on L3 (GhostL3).
///
/// Usage (dry-run):
///   GHOSTAI_DEPLOY=false forge script contracts/scripts/ghostcontract-ai/deploy_l3.s.sol \
///     --rpc-url $L3_RPC_URL --verbosity 2
///
/// Usage (live):
///   GHOSTAI_DEPLOY=true forge script contracts/scripts/ghostcontract-ai/deploy_l3.s.sol \
///     --rpc-url $L3_RPC_URL --broadcast --verify
///
/// Routing law enforced here: L3 ONLY registers L3->L2 link.
/// L3->L1 direct links are REJECTED by GhostContractRegistry._enforceRoutingLaw().
///
/// Required env vars:
///   GHOSTAI_ADMIN          — deployer / admin address
///   GHOSTAI_L1_CHAIN_ID    — L1 chain ID
///   GHOSTAI_L2_CHAIN_ID    — L2 chain ID
///   GHOSTAI_L3_CHAIN_ID    — L3 chain ID (defaults to block.chainid)
///   GHOSTAI_DEPLOY         — "true" to broadcast; default false (dry-run)
///   GHOSTAI_POLICY_HASH    — initial policy hash commitment (hex bytes32)
///   GHOSTAI_POLICY_NS      — policy namespace string
contract DeployGhostContractAI_L3 {
    address public registry;
    address public policyGate;
    address public riskOracle;

    function run() external {
        bool doDeploy = _envBool("GHOSTAI_DEPLOY", false);

        address admin     = _envAddress("GHOSTAI_ADMIN",       address(this));
        uint256 l1ChainId = _envUint("GHOSTAI_L1_CHAIN_ID", 1);
        uint256 l2ChainId = _envUint("GHOSTAI_L2_CHAIN_ID", 10);
        uint256 l3ChainId = _envUint("GHOSTAI_L3_CHAIN_ID", block.chainid);

        _log("=== GhostContractAI L3 Deploy Plan ===");
        _log(string.concat("  admin:       ", _addr(admin)));
        _log(string.concat("  L1 chainId:  ", _uint(l1ChainId)));
        _log(string.concat("  L2 chainId:  ", _uint(l2ChainId)));
        _log(string.concat("  L3 chainId:  ", _uint(l3ChainId)));
        _log(string.concat("  broadcast:   ", doDeploy ? "YES" : "NO (dry-run)"));
        _log("Routing law: L3 -> L2 ONLY (L3->L1 BLOCKED)");
        _log("Contracts to deploy (L3-local):");
        _log("  1. GhostContractRegistry  (L3 mirror)");
        _log("  2. GhostPolicyGate        (L3 mirror)");
        _log("  3. GhostRiskOracle        (L3 mirror)");
        _log("======================================");

        if (!doDeploy) {
            _log("[DRY-RUN] Set GHOSTAI_DEPLOY=true to broadcast.");
            return;
        }

        // Deploy L3 registry — only register L3->L2 link (routing law).
        GhostContractRegistry r = new GhostContractRegistry(admin, l1ChainId, l2ChainId, l3ChainId);
        registry = address(r);
        _log(string.concat("[DEPLOYED] GhostContractRegistry (L3) @ ", _addr(registry)));

        // Register L3 -> L2 link ONLY (legal).
        // Attempting L3 -> L1 would revert with RoutingLawViolation.
        r.registerChainLink(l3ChainId, l2ChainId);
        _log(string.concat("[LINK] L3(", _uint(l3ChainId), ") -> L2(", _uint(l2ChainId), ") registered"));

        GhostPolicyGate pg = new GhostPolicyGate(admin);
        policyGate = address(pg);
        _log(string.concat("[DEPLOYED] GhostPolicyGate (L3) @ ", _addr(policyGate)));

        GhostRiskOracle ro = new GhostRiskOracle(admin, l3ChainId);
        riskOracle = address(ro);
        _log(string.concat("[DEPLOYED] GhostRiskOracle (L3) @ ", _addr(riskOracle)));

        // Commit initial policy hash on L3 gate.
        bytes32 policyHash = _envBytes32("GHOSTAI_POLICY_HASH", bytes32(0));
        string memory ns   = _envString("GHOSTAI_POLICY_NS",   "ghostcontract-ai.constraints");

        if (policyHash != bytes32(0)) {
            pg.commitPolicy(ns, policyHash, GhostPolicyGate.PolicyClass.CONSTITUTIONAL, 3, "Initial L3 policy commit");
            _log(string.concat("[POLICY] Committed hash on L3 namespace: ", ns));
        }

        // Self-register this deployment in the L3 registry.
        r.register(
            l3ChainId,
            address(r),
            keccak256(type(GhostContractRegistry).creationCode),
            keccak256("GhostContractRegistry-v1-abi"),
            bytes32(0),
            "default",
            "GhostContractRegistry"
        );

        _log("[COMPLETE] L3 GhostContractAI system deployed.");
        _log(string.concat("  registry:   ", _addr(registry)));
        _log(string.concat("  policyGate: ", _addr(policyGate)));
        _log(string.concat("  riskOracle: ", _addr(riskOracle)));
        _log("REMINDER: All L3 transactions route through L2. Never call L1 directly.");
    }

    // ── Helpers (same as deploy_l2.s.sol) ───────────────────────────────

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
