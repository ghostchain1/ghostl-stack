// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/ai/AIOracleRegistry.sol";
import "../../src/ai/AIAttestationHub.sol";
import "../../src/ai/PolicyGuard.sol";
import "../../src/ai/AIAttestationTypes.sol";

contract AIAttestationHubPolicyGuardTest is TestBase {
    uint8 internal constant LAYER_L2 = 2;

    address internal governor = address(0xBEEF);
    address internal timelock = address(0xCAFE);
    address internal subject = address(0x1234);

    uint256 internal signerPk = 0xA11CE;
    address internal signer;

    AIOracleRegistry internal registry;
    AIAttestationHub internal hub;
    PolicyGuard internal guard;

    function setUp() public {
        signer = vm.addr(signerPk);
        registry = new AIOracleRegistry(governor, timelock);
        hub = new AIAttestationHub(registry, LAYER_L2, governor, timelock);
        guard = new PolicyGuard(registry, hub, LAYER_L2, governor, timelock);

        vm.prank(governor);
        registry.registerSigner(signer, 1, "ipfs://ghostai/signer");
    }

    function testSubmitAttestationValidSignature() public {
        AIAttestationTypes.AIAttestation memory att = _buildAttestation(subject, 2_500, 95, 1);
        bytes memory sig = _sign(att);

        bytes32 attestationId = hub.submitAttestation(att, sig);
        assertTrue(attestationId != bytes32(0), "attestation id");
        assertEq(hub.nonces(signer), 1, "nonce updated");

        (uint16 riskScoreBps, uint8 confidence, bytes32 latestId,,) = hub.getLatestRisk(subject, LAYER_L2);
        assertEq(riskScoreBps, att.riskScoreBps, "risk score");
        assertEq(confidence, att.confidence, "confidence");
        assertEq(latestId, attestationId, "latest id");
    }

    function testNonceReplayPrevention() public {
        AIAttestationTypes.AIAttestation memory first = _buildAttestation(subject, 2_000, 90, 1);
        bytes memory firstSig = _sign(first);
        hub.submitAttestation(first, firstSig);

        AIAttestationTypes.AIAttestation memory replay = _buildAttestation(subject, 1_000, 90, 1);
        bytes memory replaySig = _sign(replay);

        vm.expectRevert(abi.encodeWithSelector(AIAttestationHub.NonceMismatch.selector, 2, 1));
        hub.submitAttestation(replay, replaySig);
    }

    function testExpiryEnforced() public {
        uint256 nowTs = 1_700_000_000;
        vm.warp(nowTs);

        AIAttestationTypes.AIAttestation memory expired = _buildAttestation(subject, 2_000, 90, 1);
        expired.issuedAt = nowTs - 100;
        expired.expiresAt = nowTs - 1;
        expired.attestationId = AIAttestationTypes.computeAttestationId(expired);
        bytes memory sig = _sign(expired);

        vm.expectRevert(abi.encodeWithSelector(AIAttestationHub.AttestationExpired.selector, expired.expiresAt, nowTs));
        hub.submitAttestation(expired, sig);
    }

    function testPolicyGuardModes() public {
        bytes32 policyRiskThreshold = keccak256("ghostai.policy.risk.threshold.bps");
        bytes32 policyMinConfidence = keccak256("ghostai.policy.min.confidence");
        vm.prank(governor);
        registry.setPolicy(policyRiskThreshold, 3_000);
        vm.prank(governor);
        registry.setPolicy(policyMinConfidence, 80);

        AIAttestationTypes.AIAttestation memory highRisk = _buildAttestation(subject, 5_000, 90, 1);
        bytes memory sig = _sign(highRisk);
        hub.submitAttestation(highRisk, sig);

        bytes32 action = keccak256("slashing.setFeePolicy");

        // OFF never blocks.
        guard.enforcePolicy(subject, action, "");

        // ADVISORY logs but does not block.
        vm.prank(governor);
        guard.setMode(PolicyGuard.Mode.ADVISORY);
        guard.enforcePolicy(subject, action, "");

        // ENFORCE blocks on high risk.
        vm.prank(governor);
        guard.setMode(PolicyGuard.Mode.ENFORCE);
        bytes32 expectedReason = keccak256("ghostai.reason.risk_too_high");
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.PolicyViolation.selector, expectedReason));
        guard.enforcePolicy(subject, action, "");
    }

    function testGovernanceBypassRestricted() public {
        bytes32 action = keccak256("slashing.setFeePolicy");
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        guard.governanceBypass(subject, action, "");
    }

    function testAttestationIdMismatchReverts() public {
        AIAttestationTypes.AIAttestation memory att = _buildAttestation(subject, 2_000, 90, 1);
        bytes32 expectedId = AIAttestationTypes.computeAttestationId(att);
        att.attestationId = keccak256("wrong-id");
        bytes memory sig = "";

        vm.expectRevert(abi.encodeWithSelector(AIAttestationTypes.AttestationIdMismatch.selector, att.attestationId, expectedId));
        hub.submitAttestation(att, sig);
    }

    function _buildAttestation(address subject_, uint16 riskScoreBps, uint8 confidence, uint256 nonce)
        internal
        view
        returns (AIAttestationTypes.AIAttestation memory att)
    {
        att.issuedAt = block.timestamp;
        att.expiresAt = block.timestamp + 1 hours;
        att.modelVersion = 1;
        att.modelCardHash = keccak256("model-card-v1");
        att.inputHash = keccak256(abi.encode(subject_, nonce, "input"));
        att.outputHash = keccak256(abi.encode(subject_, riskScoreBps, confidence, "output"));
        att.riskScoreBps = riskScoreBps;
        att.confidence = confidence;
        att.subject = subject_;
        att.nonce = nonce;
        att.layer = LAYER_L2;
        att.explanationRef = keccak256(abi.encode(subject_, "explain"));
        att.attestationId = AIAttestationTypes.computeAttestationId(att);
    }

    function _sign(AIAttestationTypes.AIAttestation memory att) internal returns (bytes memory) {
        return _signWithDigest(_digestFor(att));
    }

    function _digestFor(AIAttestationTypes.AIAttestation memory att) internal view returns (bytes32) {
        bytes32 domain = AIAttestationTypes.domainSeparator(block.chainid, address(hub));
        bytes32 structHash = AIAttestationTypes.structHash(att);
        return AIAttestationTypes.digest(domain, structHash);
    }

    function _signWithDigest(bytes32 digest) internal returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

}
