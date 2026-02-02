// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/StakingManager.sol";
import "../../src/l1/SlashingManager.sol";
import "../../src/l1/Treasury.sol";
import "../../src/l1/Faucet.sol";
import "../../src/l1/RewardDistributor.sol";
import "../../src/GhostGasTokens.sol";
import "../../src/GhostTokenL2.sol";
import "../../src/opstack/GasToken.sol";

contract GasTokenInvariant is TestBase {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    string internal constant CANONICAL_GAS_TOKEN_STR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    address internal executor = address(0xBEEF);
    address internal executorV2 = address(0xCAFE);
    address internal watcher = address(0xD00D);
    address internal operator = address(0xABCD);

    function testCanonicalGasTokenConstants() public {
        StakingManager staking = new StakingManager(executor, executorV2);
        SlashingManager slashing = new SlashingManager(staking, executor, executorV2);
        Treasury treasury = new Treasury(IERC20Balance(CANONICAL_GAS_TOKEN), executor, executorV2);
        Faucet faucet = new Faucet(1 ether, 1 hours, executor, executorV2);
        RewardDistributor rewards = new RewardDistributor(staking, executor, executorV2);

        assertEq(staking.gasTokenAddress(), CANONICAL_GAS_TOKEN, "staking gas token");
        assertEq(slashing.gasTokenAddress(), CANONICAL_GAS_TOKEN, "slashing gas token");
        assertEq(treasury.gasTokenAddress(), CANONICAL_GAS_TOKEN, "treasury gas token");
        assertEq(faucet.gasTokenAddress(), CANONICAL_GAS_TOKEN, "faucet gas token");
        assertEq(address(rewards.rewardToken()), CANONICAL_GAS_TOKEN, "reward token");
    }

    function testFeePolicyOnlyGovernance() public {
        StakingManager staking = new StakingManager(executor, executorV2);
        SlashingManager slashing = new SlashingManager(staking, executor, executorV2);

        SlashingManager.FeePolicyParams memory policy = SlashingManager.FeePolicyParams({
            maxBaseFeeGHOST: 2 gwei,
            maxPriorityFeeGHOST: 1 gwei,
            spikeThresholdBps: 500,
            windowSeconds: 300,
            violationPenaltyBps: 1000,
            minBondGHOST: 10 ether
        });

        vm.expectRevert(bytes("NOT_EXECUTOR"));
        slashing.setFeePolicy(policy);

        vm.prank(executor);
        slashing.setFeePolicy(policy);
        (uint256 maxBaseFee,,,,,) = slashing.feePolicy();
        assertEq(maxBaseFee, policy.maxBaseFeeGHOST, "policy set");
    }

    function testSlashingControlsOnlyGovernance() public {
        StakingManager staking = new StakingManager(executor, executorV2);
        SlashingManager slashing = new SlashingManager(staking, executor, executorV2);

        assertTrue(!slashing.autoExecEnabled(), "auto exec default");

        vm.expectRevert(bytes("NOT_EXECUTOR"));
        slashing.setWatcherRoles(watcher, true);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        slashing.enableAutoExec(true);

        vm.prank(executor);
        slashing.setWatcherRoles(watcher, true);
        vm.prank(executor);
        slashing.enableAutoExec(true);

        assertTrue(slashing.watchers(watcher), "watcher set");
        assertTrue(slashing.autoExecEnabled(), "auto exec enabled by governance");
    }

    function testFeeViolationSlashesBond() public {
        StakingManager staking = new StakingManager(executor, executorV2);
        SlashingManager slashing = new SlashingManager(staking, executor, executorV2);

        vm.prank(executor);
        staking.setSlashManager(address(slashing));

        SlashingManager.FeePolicyParams memory policy = SlashingManager.FeePolicyParams({
            maxBaseFeeGHOST: 2 gwei,
            maxPriorityFeeGHOST: 1 gwei,
            spikeThresholdBps: 500,
            windowSeconds: 300,
            violationPenaltyBps: 1000,
            minBondGHOST: 10 ether
        });

        vm.prank(executor);
        slashing.setFeePolicy(policy);
        vm.prank(executor);
        slashing.setWatcherRoles(watcher, true);
        vm.prank(executor);
        slashing.enableAutoExec(true);

        _setStake(staking, operator, 100 ether);

        SlashingManager.FeeViolationEvidence memory evidence;
        evidence.chainId = 901;
        evidence.blockStart = 100;
        evidence.blockEnd = 110;
        evidence.observedBaseFee = 3 gwei;
        evidence.observedPriorityFee = 1 gwei;
        evidence.prevBaseFee = 2 gwei;
        evidence.prevPriorityFee = 1 gwei;
        evidence.logsHash = keccak256("fee-violation");
        evidence.attestor = watcher;
        evidence.signature = "";

        vm.prank(watcher);
        (uint256 violationId, uint256 slashAmount) = slashing.reportFeeViolation(operator, evidence);

        uint256 expectedSlash = 10 ether;
        assertTrue(violationId > 0, "violation id");
        assertEq(slashAmount, expectedSlash, "slash amount");
        assertEq(staking.stakes(operator), 90 ether, "stake reduced");
        (,,,,,,,,,,, , bool wasSlashed,) = slashing.violations(violationId);
        assertTrue(wasSlashed, "violation slashed");
    }

    function testConfigFilesReferenceCanonicalGasToken() public {
        _assertCanonicalConfig("../infra/opstack/config/deploy-config.json");
        _assertCanonicalConfig("../infra/opstack/config/deploy-config.l3.json");
        _assertCanonicalConfig("../infra/opstack/op-intent/intent.toml");
        _assertCanonicalConfig("../infra/opstack/l3/op-intent/intent.toml");
        _assertCanonicalConfig("../infra/opstack/.env.sample");
        _assertCanonicalConfig("../infra/scripts/opstack/preflight-3layer.sh");
        _assertCanonicalConfig("../infra/scripts/opstack/deploy-l3.sh");
        _assertCanonicalConfig("../infra/scripts/opstack/up-l3.sh");
        _assertCanonicalConfig("../infra/opstack/contracts/script/DeployL1.s.sol");
        _assertCanonicalConfig("../services/ghost-gas-engine/config/chains.json");
        _assertCanonicalConfig("../services/ghost-relayer/src/index.ts");
        _assertCanonicalConfig("../services/stack.env");
        _assertCanonicalConfig("../services/stack.env.example");
        _assertCanonicalConfig("../apps/api/src/server.ts");
    }

    function testPerLayerGasTokenDeploymentsRevert() public {
        vm.expectRevert();
        new GhostGasTokenL2(1);
        vm.expectRevert();
        new GhostGasTokenL3(1);
        vm.expectRevert();
        new GhostTokenL2();
        vm.expectRevert();
        new GasToken("Ghost Token", "GHOST", 18, 1 ether, address(this));
    }

    function testRepoWideGasTokenGuard() public {
        string memory rgBase =
            "cd .. && rg -n --hidden --no-messages"
            " --glob '!backups/**'"
            " --glob '!ops/snapshots/**'"
            " --glob '!infra/docker/_backup/**'"
            " --glob '!infra/opstack/backups*/**'"
            " --glob '!infra/opstack/data/**'"
            " --glob '!infra/**/data/**'"
            " --glob '!infra/opstack/optimism/**'"
            " --glob '!infra/opstack/optimism-upstream/**'"
            " --glob '!infra/opstack/op-geth/**'"
            " --glob '!infra/opstack/alloc_merged.json'"
            " --glob '!infra/docker/runtime/**'"
            " --glob '!infra/docker/audit/**'"
            " --glob '!contracts/artifacts/**'"
            " --glob '!contracts/cache*/**'"
            " --glob '!contracts/out*/**'"
            " --glob '!contracts/reports/**'"
            " --glob '!contracts/test/**'"
            " --glob '!services/*/data/**'"
            " --glob '!**/node_modules/**'"
            " --glob '!.git/**'";

        string memory disallowedPatternsCmd = string.concat(
            rgBase,
            " -e 'gasTokenSymbol\\\": \\\"ETH\\\"|gasPayingTokenSymbol = \\\"ETH\\\"|GAS_TOKEN_L1=ETH|GAS_TOKEN_L2=ETH|GAS_TOKEN_L3=ETH'"
            " apps contracts infra services packages || true"
        );
        _rgNoMatches(disallowedPatternsCmd, "disallowed gas token patterns");

        string memory nonCanonicalAddressCmd = string.concat(
            rgBase,
            " -e 'customGasTokenAddress\\s*[:=]\\s*\"0x[0-9a-fA-F]{40}\"|CUSTOM_GAS_TOKEN_ADDRESS=0x[0-9a-fA-F]{40}|GAS_TOKEN_ADDRESS(_L[123])?=0x[0-9a-fA-F]{40}|L[123]_TOKEN_ADDRESS=0x[0-9a-fA-F]{40}'"
            " apps contracts infra services packages | rg -v '",
            CANONICAL_GAS_TOKEN_STR,
            "' || true"
        );
        _rgNoMatches(nonCanonicalAddressCmd, "non-canonical gas token addresses");
    }

    function _assertCanonicalConfig(string memory path) internal {
        string memory content = vm.readFile(path);
        assertTrue(_contains(content, CANONICAL_GAS_TOKEN_STR), "missing canonical gas token");
        assertTrue(!_contains(content, "gasTokenSymbol\": \"ETH\""), "ETH gas symbol");
        assertTrue(!_contains(content, "gasPayingTokenSymbol = \"ETH\""), "ETH gas symbol");
        assertTrue(!_contains(content, "GAS_TOKEN_L1=ETH"), "ETH gas symbol");
        assertTrue(!_contains(content, "GAS_TOKEN_L2=ETH"), "ETH gas symbol");
        assertTrue(!_contains(content, "GAS_TOKEN_L3=ETH"), "ETH gas symbol");
    }

    function _setStake(StakingManager staking, address staker, uint256 amount) internal {
        bytes32 slot = keccak256(abi.encode(staker, uint256(3)));
        vm.store(address(staking), slot, bytes32(amount));
        vm.store(address(staking), bytes32(uint256(4)), bytes32(amount));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || h.length < n.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return true;
        }
        return false;
    }

    function _rgNoMatches(string memory command, string memory label) internal {
        string[] memory inputs = new string[](3);
        inputs[0] = "bash";
        inputs[1] = "-lc";
        inputs[2] = command;
        bytes memory out = vm.ffi(inputs);
        if (out.length > 0) {
            revert(string.concat(label, ":\n", string(out)));
        }
    }
}
