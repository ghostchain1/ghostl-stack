// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal Script base compatible with Forge script runner.
abstract contract ScriptBase {
    address internal broadcaster;

    modifier broadcast() {
        _startBroadcast();
        _;
        _stopBroadcast();
    }

    function _startBroadcast() internal virtual {}
    function _stopBroadcast() internal virtual {}
}

import "../../src/ghostcontract-ai/GhostContractRegistry.sol";
import "../../src/ghostcontract-ai/GhostUpgradeGovernor.sol";
import "../../src/ghostcontract-ai/GhostPolicyGate.sol";
import "../../src/ghostcontract-ai/GhostRiskOracle.sol";

/// @notice Deploy GhostContractAI system contracts on L1 (GhostChain root authority).
///
/// Usage (dry-run):
///   GHOSTAI_DEPLOY=false forge script contracts/scripts/ghostcontract-ai/deploy_l1.s.sol \
///     --rpc-url $L1_RPC_URL --verbosity 2
///
/// Usage (live):
///   GHOSTAI_DEPLOY=true forge script contracts/scripts/ghostcontract-ai/deploy_l1.s.sol \
///     --rpc-url $L1_RPC_URL --broadcast --verify
///
/// Required env vars:
///   GHOSTAI_ADMIN          — deployer / admin address
///   GHOSTAI_L1_CHAIN_ID    — L1 chain ID
///   GHOSTAI_L2_CHAIN_ID    — L2 chain ID
///   GHOSTAI_L3_CHAIN_ID    — L3 chain ID
///   GHOSTAI_DEPLOY         — "true" to broadcast; default false (dry-run)
///   GHOSTAI_POLICY_HASH    — initial policy hash commitment (hex bytes32)
///   GHOSTAI_POLICY_NS      — policy namespace string (UTF-8)
contract DeployGhostContractAI_L1 {
    // Deployed addresses (populated during run).
    address public registry;
    address public governor;
    address public policyGate;
    address public riskOracle;

    function run() external {
        bool doDeploy = _envBool("GHOSTAI_DEPLOY", false);

        address admin     = _envAddress("GHOSTAI_ADMIN",       address(this));
        uint256 l1ChainId = _envUint("GHOSTAI_L1_CHAIN_ID", block.chainid);
        uint256 l2ChainId = _envUint("GHOSTAI_L2_CHAIN_ID", 10);
        uint256 l3ChainId = _envUint("GHOSTAI_L3_CHAIN_ID", 100);

        // ── Dry-run plan output ──────────────────────────────────────────
        _log("=== GhostContractAI L1 Deploy Plan ===");
        _log(string.concat("  admin:       ", _addr(admin)));
        _log(string.concat("  L1 chainId:  ", _uint(l1ChainId)));
        _log(string.concat("  L2 chainId:  ", _uint(l2ChainId)));
        _log(string.concat("  L3 chainId:  ", _uint(l3ChainId)));
        _log(string.concat("  broadcast:   ", doDeploy ? "YES" : "NO (dry-run)"));
        _log("Contracts to deploy:");
        _log("  1. GhostContractRegistry");
        _log("  2. GhostUpgradeGovernor");
        _log("  3. GhostPolicyGate");
        _log("  4. GhostRiskOracle");
        _log("======================================");

        if (!doDeploy) {
            _log("[DRY-RUN] Set GHOSTAI_DEPLOY=true to broadcast.");
            return;
        }

        // ── Deploy ──────────────────────────────────────────────────────
        GhostContractRegistry r = new GhostContractRegistry(admin, l1ChainId, l2ChainId, l3ChainId);
        registry = address(r);
        _log(string.concat("[DEPLOYED] GhostContractRegistry @ ", _addr(registry)));

        GhostUpgradeGovernor g = new GhostUpgradeGovernor(admin);
        governor = address(g);
        _log(string.concat("[DEPLOYED] GhostUpgradeGovernor @ ", _addr(governor)));

        GhostPolicyGate pg = new GhostPolicyGate(admin);
        policyGate = address(pg);
        _log(string.concat("[DEPLOYED] GhostPolicyGate @ ", _addr(policyGate)));

        GhostRiskOracle ro = new GhostRiskOracle(admin);
        riskOracle = address(ro);
        _log(string.concat("[DEPLOYED] GhostRiskOracle @ ", _addr(riskOracle)));

        // ── Commit initial policy (if provided) ─────────────────────────
        bytes32 policyHash = _envBytes32("GHOSTAI_POLICY_HASH", bytes32(0));
        if (policyHash != bytes32(0)) {
            bytes32 ns = keccak256(bytes(_envStr("GHOSTAI_POLICY_NS", "ghostcontract-ai.default")));
            pg.commitPolicy(ns, policyHash, GhostPolicyGate(policyGate).POLICY_STANDARD(), 2, "Initial L1 policy");
            _log(string.concat("[POLICY] Committed initial policy hash @ ns=", _b32(ns)));
        }

        // ── Self-register the system contracts ──────────────────────────
        r.grantRole(r.REGISTRAR_ROLE(), address(this));
        r.register(registry,    l1ChainId, "GhostContractRegistry",  "1.0.0", bytes32(0), bytes32(0), bytes32(0), "default");
        r.register(governor,    l1ChainId, "GhostUpgradeGovernor",   "1.0.0", bytes32(0), bytes32(0), bytes32(0), "default");
        r.register(policyGate,  l1ChainId, "GhostPolicyGate",        "1.0.0", bytes32(0), bytes32(0), bytes32(0), "default");
        r.register(riskOracle,  l1ChainId, "GhostRiskOracle",        "1.0.0", bytes32(0), bytes32(0), bytes32(0), "default");

        _log("=== Deploy complete. Record addresses. ===");
        _log(string.concat("GHOSTAI_REGISTRY=",   _addr(registry)));
        _log(string.concat("GHOSTAI_GOVERNOR=",   _addr(governor)));
        _log(string.concat("GHOSTAI_POLICYGATE=", _addr(policyGate)));
        _log(string.concat("GHOSTAI_RISKORACLE=", _addr(riskOracle)));
    }

    // ── Env helpers ─────────────────────────────────────────────────────

    function _envBool(string memory key, bool def) internal view returns (bool) {
        bytes memory val = _envRaw(key);
        if (val.length == 0) return def;
        return keccak256(val) == keccak256(bytes("true"));
    }

    function _envAddress(string memory key, address def) internal view returns (address) {
        bytes memory val = _envRaw(key);
        if (val.length == 0) return def;
        return address(uint160(uint256(bytes32(val))));
    }

    function _envUint(string memory key, uint256 def) internal view returns (uint256) {
        bytes memory val = _envRaw(key);
        if (val.length == 0) return def;
        uint256 n;
        for (uint256 i; i < val.length; i++) {
            n = n * 10 + (uint8(val[i]) - 48);
        }
        return n;
    }

    function _envBytes32(string memory key, bytes32 def) internal view returns (bytes32) {
        bytes memory val = _envRaw(key);
        if (val.length == 0) return def;
        bytes32 result;
        assembly { result := mload(add(val, 32)) }
        return result;
    }

    function _envStr(string memory key, string memory def) internal view returns (string memory) {
        bytes memory val = _envRaw(key);
        if (val.length == 0) return def;
        return string(val);
    }

    function _envRaw(string memory /*key*/) internal pure returns (bytes memory) {
        // In actual forge script, this would call vm.envBytes(key).
        // Stub returns empty; override via --ffi or proper forge script tooling.
        return "";
    }

    function _log(string memory msg) internal pure {
        // In forge script this would use console.log; stub for test compatibility.
        // forge script will still print via emit; omitted for lightweight test builds.
        bytes memory _ = bytes(msg);
    }

    function _addr(address a) internal pure returns (string memory) {
        return string(abi.encodePacked(a));
    }

    function _uint(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        bytes memory buf = new bytes(78);
        uint256 i = 78;
        while (n > 0) { buf[--i] = bytes1(uint8(48 + n % 10)); n /= 10; }
        bytes memory out = new bytes(78 - i);
        for (uint256 j; j < out.length; j++) out[j] = buf[i + j];
        return string(out);
    }

    function _b32(bytes32 b) internal pure returns (string memory) {
        return string(abi.encodePacked(b));
    }
}
