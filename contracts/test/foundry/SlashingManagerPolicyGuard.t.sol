// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/StakingManager.sol";
import "../../src/l1/SlashingManager.sol";
import "../../src/ai/AIOracleRegistry.sol";
import "../../src/ai/AIAttestationHub.sol";
import "../../src/ai/PolicyGuard.sol";
import "../../src/ai/AIAttestationTypes.sol";

contract SlashingManagerPolicyGuardTest is TestBase {
    uint8 internal constant LAYER_L1 = 1;

    address internal governor = address(0xBEEF);
    address internal timelock = address(0xCAFE);

    uint256 internal signerPk = 0xA11CE;
    address internal signer;

    StakingManager internal staking;
    SlashingManager internal slashing;
    AIOracleRegistry internal registry;
    AIAttestationHub internal hub;
    PolicyGuard internal guard;

    function setUp() public {
        vm.warp(1_700_000_000);

        signer = vm.addr(signerPk);

        staking = new StakingManager(governor, timelock);
        slashing = new SlashingManager(staking, governor, timelock);

        registry = new AIOracleRegistry(governor, timelock);
        hub = new AIAttestationHub(registry, LAYER_L1, governor, timelock);
        guard = new PolicyGuard(registry, hub, LAYER_L1, governor, timelock);

        vm.prank(governor);
        registry.registerSigner(signer, 1, "ipfs://ghostai/signer");

        vm.prank(governor);
        registry.setPolicy(keccak256("ghostai.policy.risk.threshold.bps"), 3_000);
        vm.prank(governor);
        registry.setPolicy(keccak256("ghostai.policy.min.confidence"), 80);
        vm.prank(governor);
        registry.setPolicy(keccak256("ghostai.policy.max.attestation.age"), 1 days);

        vm.prank(governor);
        guard.setMode(PolicyGuard.Mode.ENFORCE);

        vm.prank(governor);
        slashing.setPolicyGuard(guard);
    }

    function testHighRiskBlocksSetFeePolicy() public {
        AIAttestationTypes.AIAttestation memory att = _buildAttestation(1, 5_000, 90);
        bytes memory sig = _sign(att);
        hub.submitAttestation(att, sig);

        SlashingManager.FeePolicyParams memory policy = _validPolicy();
        bytes32 expectedReason = keccak256("ghostai.reason.risk_too_high");

        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.PolicyViolation.selector, expectedReason));
        slashing.setFeePolicy(policy);
    }

    function testLowRiskAllowsSetFeePolicy() public {
        AIAttestationTypes.AIAttestation memory lowRisk = _buildAttestation(1, 2_000, 90);
        bytes memory sig = _sign(lowRisk);
        hub.submitAttestation(lowRisk, sig);

        SlashingManager.FeePolicyParams memory policy = _validPolicy();

        vm.prank(governor);
        slashing.setFeePolicy(policy);

        (uint256 maxBaseFee,,,,,) = slashing.feePolicy();
        assertEq(maxBaseFee, policy.maxBaseFeeGHOST, "policy applied");
    }

    function testGovernanceBypassAlwaysSucceeds() public {
        AIAttestationTypes.AIAttestation memory att = _buildAttestation(1, 5_000, 90);
        bytes memory sig = _sign(att);
        hub.submitAttestation(att, sig);

        SlashingManager.FeePolicyParams memory policy = _validPolicy();

        vm.prank(governor);
        slashing.setFeePolicyBypass(policy);

        (uint256 maxBaseFee,,,,,) = slashing.feePolicy();
        assertEq(maxBaseFee, policy.maxBaseFeeGHOST, "bypass applied");
    }

    function _validPolicy() internal pure returns (SlashingManager.FeePolicyParams memory policy) {
        policy = SlashingManager.FeePolicyParams({
            maxBaseFeeGHOST: 2 gwei,
            maxPriorityFeeGHOST: 1 gwei,
            spikeThresholdBps: 500,
            windowSeconds: 300,
            violationPenaltyBps: 1_000,
            minBondGHOST: 10 * GST_UNIT
        });
    }

    function _buildAttestation(uint256 nonce, uint16 riskScoreBps, uint8 confidence)
        internal
        view
        returns (AIAttestationTypes.AIAttestation memory att)
    {
        att.issuedAt = block.timestamp;
        att.expiresAt = block.timestamp + 1 hours;
        att.modelVersion = 1;
        att.modelCardHash = keccak256("model-card-v1");
        att.inputHash = keccak256(abi.encode(address(slashing), nonce, "input"));
        att.outputHash = keccak256(abi.encode(address(slashing), riskScoreBps, confidence, "output"));
        att.riskScoreBps = riskScoreBps;
        att.confidence = confidence;
        att.subject = address(slashing);
        att.nonce = nonce;
        att.layer = LAYER_L1;
        att.explanationRef = keccak256(abi.encode(address(slashing), "explain"));
        att.attestationId = AIAttestationTypes.computeAttestationId(att);
    }

    function _sign(AIAttestationTypes.AIAttestation memory att) internal returns (bytes memory sig) {
        bytes32 digest = _digest(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _digest(AIAttestationTypes.AIAttestation memory att) internal view returns (bytes32) {
        bytes32 domain = AIAttestationTypes.domainSeparator(block.chainid, address(hub));
        bytes32 structHash = AIAttestationTypes.structHash(att);
        return AIAttestationTypes.digest(domain, structHash);
    }
}
