// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/AIGuardianL1.sol";
import "../../src/ai/AILayerGuardian.sol";

contract GuardianTarget {
    uint256 public value;

    function setValue(uint256 v) external {
        value = v;
    }
}

contract AIGuardianTest is TestBase {
    bytes32 private constant FRAUD_TYPEHASH =
        keccak256(
            "FraudAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,uint8 verdict,uint32 riskScoreBps,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );
    bytes32 private constant COMPLIANCE_TYPEHASH =
        keccak256(
            "ComplianceAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,uint8 decision,uint64 delaySeconds,bytes32 ruleId,bytes32 jurisdiction,bytes32 detailsHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );
    bytes32 private constant EXPLAINABILITY_TYPEHASH =
        keccak256(
            "ExplainabilityAttestation(uint256 nonce,uint8 layerId,bytes32 operationId,bytes32 subjectHash,bytes32 uriHash,bytes32 summaryHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 modelId,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest)"
        );

    bytes32 private constant MODEL_ID = keccak256("ghost-ai-v1");
    bytes32 private constant L1_DIGEST = keccak256("l1-state");
    bytes32 private constant L2_DIGEST = keccak256("l2-state");
    bytes32 private constant L3_DIGEST = keccak256("l3-state");
    bytes32 private constant OFFCHAIN_DIGEST = keccak256("offchain-state");

    uint256 private signerKey = 0xA11CE;
    address private signer;
    address private oracle = address(0xBEEF);

    AIGuardianL1 private guardian;
    GuardianTarget private target;

    function setUp() public {
        guardian = new AIGuardianL1();
        target = new GuardianTarget();

        signer = vm.addr(signerKey);
        guardian.setSigner(signer, true);
        guardian.setModelPolicy(MODEL_ID, true, 7000, bytes32(0), bytes32(0));
        guardian.setLayerOracle(guardian.L1(), oracle, true);
        guardian.setLayerOracle(guardian.L2(), oracle, true);
        guardian.setLayerOracle(guardian.L3(), oracle, true);
        guardian.setOffchainOracle(oracle, true);

        vm.prank(oracle);
        guardian.submitLayerDigest(guardian.L1(), L1_DIGEST, 1, uint64(block.timestamp));
        vm.prank(oracle);
        guardian.submitLayerDigest(guardian.L2(), L2_DIGEST, 1, uint64(block.timestamp));
        vm.prank(oracle);
        guardian.submitLayerDigest(guardian.L3(), L3_DIGEST, 1, uint64(block.timestamp));
        vm.prank(oracle);
        guardian.submitOffchainDigest(OFFCHAIN_DIGEST, uint64(block.timestamp));

        guardian.setActionPolicy(address(target), GuardianTarget.setValue.selector, true, 0, true, 0, 100);
    }

    function testExecuteIfAllowed() public {
        bytes memory data = abi.encode(uint256(7));
        bytes32 operationId = guardian.computeOperationId(
            address(this),
            address(target),
            GuardianTarget.setValue.selector,
            data,
            0
        );

        _submitFraud(operationId, uint8(AILayerGuardian.FraudVerdict.CLEAR), 1200);
        _submitCompliance(operationId, uint8(AILayerGuardian.ComplianceDecision.ALLOW), 0);

        (bool allowed,,) = guardian.checkTransaction(operationId);
        assertTrue(allowed, "not allowed");

        guardian.executeIfAllowed(address(target), GuardianTarget.setValue.selector, data);
        assertEq(target.value(), 7, "value not set");
    }

    function testDelayBlocksThenAllows() public {
        bytes memory data = abi.encode(uint256(11));
        bytes32 operationId = guardian.computeOperationId(
            address(this),
            address(target),
            GuardianTarget.setValue.selector,
            data,
            0
        );

        _submitFraud(operationId, uint8(AILayerGuardian.FraudVerdict.CLEAR), 500);
        _submitCompliance(operationId, uint8(AILayerGuardian.ComplianceDecision.DELAY), 3600);

        (bool allowed, uint64 waitSeconds, bytes32 reason) = guardian.checkTransaction(operationId);
        require(!allowed, "should be delayed");
        require(waitSeconds > 0, "no delay");
        require(reason == guardian.REASON_COMPLIANCE_DELAY(), "reason mismatch");

        vm.expectRevert(bytes("delayed"));
        guardian.executeIfAllowed(address(target), GuardianTarget.setValue.selector, data);

        vm.warp(block.timestamp + 3601);
        guardian.executeIfAllowed(address(target), GuardianTarget.setValue.selector, data);
        assertEq(target.value(), 11, "value not set");
    }

    function testExplainabilityStored() public {
        bytes memory data = abi.encode(uint256(3));
        bytes32 operationId = guardian.computeOperationId(
            address(this),
            address(target),
            GuardianTarget.setValue.selector,
            data,
            0
        );

        bytes32 decisionHash = _submitFraud(operationId, uint8(AILayerGuardian.FraudVerdict.CLEAR), 100);

        string memory uri = "ipfs://ghost-ai/explain/1";
        string memory summary = "AI cleared transaction with low anomaly score.";
        bytes32 uriHash = keccak256(bytes(uri));
        bytes32 summaryHash = keccak256(bytes(summary));
        AILayerGuardian.ExplainabilityAttestation memory att = AILayerGuardian.ExplainabilityAttestation({
            nonce: 7,
            layerId: guardian.L1(),
            operationId: operationId,
            subjectHash: decisionHash,
            uriHash: uriHash,
            summaryHash: summaryHash,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 7200),
            confidenceBps: 8000,
            modelId: MODEL_ID,
            l1Digest: L1_DIGEST,
            l2Digest: L2_DIGEST,
            l3Digest: L3_DIGEST,
            offchainDigest: OFFCHAIN_DIGEST
        });

        bytes32 structHash = keccak256(abi.encode(EXPLAINABILITY_TYPEHASH, att));
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _sign(structHash);
        guardian.submitExplainability(att, uri, summary, sigs);

        AILayerGuardian.Explainability memory stored = guardian.explainabilityByAttestation(decisionHash);
        require(stored.uriHash == uriHash, "uri hash");
        require(stored.summaryHash == summaryHash, "summary hash");
        require(keccak256(bytes(stored.uri)) == keccak256(bytes(uri)), "uri mismatch");
        require(keccak256(bytes(stored.summary)) == keccak256(bytes(summary)), "summary mismatch");
    }

    function _submitFraud(
        bytes32 operationId,
        uint8 verdict,
        uint32 riskScore
    ) internal returns (bytes32) {
        AILayerGuardian.FraudAttestation memory att = AILayerGuardian.FraudAttestation({
            nonce: 1,
            layerId: guardian.L1(),
            operationId: operationId,
            verdict: verdict,
            riskScoreBps: riskScore,
            detailsHash: keccak256("fraud"),
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 7200),
            confidenceBps: 9000,
            modelId: MODEL_ID,
            l1Digest: L1_DIGEST,
            l2Digest: L2_DIGEST,
            l3Digest: L3_DIGEST,
            offchainDigest: OFFCHAIN_DIGEST
        });
        bytes32 structHash = keccak256(abi.encode(FRAUD_TYPEHASH, att));
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _sign(structHash);
        return guardian.submitFraudAssessment(att, sigs);
    }

    function _submitCompliance(
        bytes32 operationId,
        uint8 decision,
        uint64 delaySeconds
    ) internal returns (bytes32) {
        AILayerGuardian.ComplianceAttestation memory att = AILayerGuardian.ComplianceAttestation({
            nonce: 2,
            layerId: guardian.L1(),
            operationId: operationId,
            decision: decision,
            delaySeconds: delaySeconds,
            ruleId: keccak256("rule"),
            jurisdiction: keccak256("us"),
            detailsHash: keccak256("compliance"),
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 3600),
            confidenceBps: 9000,
            modelId: MODEL_ID,
            l1Digest: L1_DIGEST,
            l2Digest: L2_DIGEST,
            l3Digest: L3_DIGEST,
            offchainDigest: OFFCHAIN_DIGEST
        });
        bytes32 structHash = keccak256(abi.encode(COMPLIANCE_TYPEHASH, att));
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _sign(structHash);
        return guardian.submitComplianceDecision(att, sigs);
    }

    function _sign(bytes32 structHash) internal returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", guardian.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
