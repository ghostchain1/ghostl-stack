// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/GhostConstitution.sol";
import "../../src/ai/AICommandCenter.sol";
import "../../src/ai/EvidenceBundle.sol";
import "../../src/common/ConstitutionalGuard.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/l1/UpgradeManager.sol";
import "../../src/ai/EvidenceAnchor.sol";

contract DummyTarget {
    uint256 public lastValue;

    function ping(uint256 value) external {
        lastValue = value;
    }
}

contract ConstitutionalBindingTest is TestBase {
    GhostConstitution private constitution;
    ConstitutionalGuard private guard;
    EvidenceAnchor private anchor;
    EvidenceBundle private bundle;

    function setUp() public {
        constitution = new GhostConstitution(address(this), address(0), address(0));
        guard = new ConstitutionalGuard(address(this), address(0), address(constitution));
        anchor = new EvidenceAnchor(address(this), address(0));
        bundle = new EvidenceBundle(address(this), address(0), anchor);
        anchor.setGovernance(address(bundle), address(0));
    }

    function testUpgradeRequiresConstitution() public {
        UpgradeManager manager = new UpgradeManager();
        manager.setConstitutionalGuard(guard);
        manager.setEvidenceBundle(bundle);

        bytes32 implHash = keccak256("impl-v1");
        uint256 activateAt = block.timestamp;
        uint256 id = manager.propose(implHash, activateAt);

        vm.expectRevert();
        manager.execute(id);

        bytes32 actionHash = keccak256(abi.encode(keccak256("ghost.upgrade.execute"), id, implHash, activateAt));
        constitution.permitAction(actionHash, true);
        manager.execute(id);
    }

    function testGovernanceRequiresConstitution() public {
        ProposalExecutor executor = new ProposalExecutor(0);
        executor.setGovernor(address(this));
        executor.setConstitutionalGuard(guard);
        executor.setEvidenceBundle(bundle);

        DummyTarget target = new DummyTarget();
        bytes memory data = abi.encodeWithSelector(target.ping.selector, 42);
        uint256 txId = executor.queueTx(address(target), 0, data);
        (address queuedTarget, uint256 queuedValue, bytes memory queuedData, uint256 queuedEta, bool queuedExecuted) =
            executor.queue(txId);
        queuedExecuted;

        vm.expectRevert();
        executor.execute(txId);

        bytes32 actionHash = keccak256(
            abi.encode(
                keccak256("ghost.governance.execute"),
                txId,
                queuedTarget,
                queuedValue,
                keccak256(queuedData),
                queuedEta
            )
        );
        constitution.permitAction(actionHash, true);
        executor.execute(txId);
        assertEq(target.lastValue(), 42, "target updated");
    }

    function testAICommandRequiresConstitution() public {
        AICommandCenter ai = new AICommandCenter();
        ai.setConstitutionalGuard(guard);
        ai.setEvidenceBundle(bundle);

        DummyTarget target = new DummyTarget();
        ai.setActionPolicy(address(target), target.ping.selector, true, 0, false, 0, 0);
        ai.setLayerRequired(ai.L1(), false);
        ai.setLayerRequired(ai.L2(), false);
        ai.setLayerRequired(ai.L3(), false);
        ai.setPolicy(1, 1 days, false, 1);

        bytes32 modelId = keccak256("model");
        ai.setModel(modelId, true);
        uint256 signerKey = 0xBEEF;
        address signer = vm.addr(signerKey);
        ai.setSigner(signer, true);

        AICommandCenter.Decision memory decision = AICommandCenter.Decision({
            nonce: 1,
            action: 1,
            target: address(target),
            selector: target.ping.selector,
            data: abi.encode(uint256(77)),
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            confidenceBps: 9000,
            l1Digest: bytes32(0),
            l2Digest: bytes32(0),
            l3Digest: bytes32(0),
            offchainDigest: bytes32(0),
            modelId: modelId,
            gasLimit: 0
        });

        bytes32 decisionHash = keccak256(
            abi.encode(
                keccak256(
                    "Decision(uint256 nonce,uint8 action,address target,bytes4 selector,bytes32 dataHash,uint64 issuedAt,uint64 validUntil,uint32 confidenceBps,bytes32 l1Digest,bytes32 l2Digest,bytes32 l3Digest,bytes32 offchainDigest,bytes32 modelId,uint64 gasLimit)"
                ),
                AICommandCenter.DecisionHashData({
                    nonce: decision.nonce,
                    action: decision.action,
                    target: decision.target,
                    selector: decision.selector,
                    dataHash: keccak256(decision.data),
                    issuedAt: decision.issuedAt,
                    validUntil: decision.validUntil,
                    confidenceBps: decision.confidenceBps,
                    l1Digest: decision.l1Digest,
                    l2Digest: decision.l2Digest,
                    l3Digest: decision.l3Digest,
                    offchainDigest: decision.offchainDigest,
                    modelId: decision.modelId,
                    gasLimit: decision.gasLimit
                })
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("GhostAICommandCenter")),
                keccak256(bytes("1")),
                block.chainid,
                address(ai)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, decisionHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = abi.encodePacked(r, s, v);

        vm.expectRevert();
        ai.executeDecision(decision, signatures);

        bytes32 actionHash = keccak256(
            abi.encode(
                keccak256("ghost.ai.command.execute"),
                decisionHash,
                decision.target,
                decision.selector,
                keccak256(decision.data),
                decision.gasLimit
            )
        );
        constitution.permitAction(actionHash, true);
        ai.executeDecision(decision, signatures);
        assertEq(target.lastValue(), 77, "decision executed");
    }
}
