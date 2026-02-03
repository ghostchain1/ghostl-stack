// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/AIProposalExecutor.sol";
import "../../src/governance/PolicyRegistry.sol";
import "../../src/governance/EvidenceVault.sol";

contract AIProposalExecutorTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    bytes32 private constant CONSTITUTION = keccak256("ghost.constitution");
    bytes32 private constant POLICY_KEY = keccak256("ghost.policy.gas.max");
    bytes32 private constant EVIDENCE_KIND = keccak256("ghost.evidence.simulation");

    function testExecutePolicyUpdateWithSignature() public {
        PolicyRegistry registry = new PolicyRegistry(GOVERNOR, TIMELOCK, CONSTITUTION);
        EvidenceVault vault = new EvidenceVault(GOVERNOR, TIMELOCK, CONSTITUTION);
        AIProposalExecutor executor = new AIProposalExecutor(GOVERNOR, TIMELOCK, CONSTITUTION);

        vm.prank(GOVERNOR);
        executor.setPolicyRegistry(registry);
        vm.prank(GOVERNOR);
        executor.setEvidenceVault(vault);
        vm.prank(GOVERNOR);
        executor.setSignerSetHash(keccak256("signers"));

        vm.prank(GOVERNOR);
        vault.setSubmitter(address(executor), true);

        vm.prank(GOVERNOR);
        registry.setPolicySetting(POLICY_KEY, 1, 100, 0, 60, 0, true, true);
        vm.prank(GOVERNOR);
        registry.setGovernance(address(executor), TIMELOCK);

        uint256 signerPk = 0xA11CE;
        address signer = vm.addr(signerPk);
        vm.prank(GOVERNOR);
        executor.setApprover(signer, true);

        AIProposalExecutor.PolicyUpdate memory update = AIProposalExecutor.PolicyUpdate({
            policyKey: POLICY_KEY,
            value: 10,
            evidenceHash: keccak256("evidence"),
            metadataHash: keccak256("metadata"),
            nonce: 1,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            emergency: false
        });

        bytes32 digest = executor.digestUpdate(update);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        vm.prank(address(0xCAFE));
        executor.executePolicyUpdate(update, sigs, EVIDENCE_KIND, 7);

        (uint256 value,, bool emergency,,) = registry.effectivePolicy(POLICY_KEY);
        assertEq(value, 10, "policy value");
        assertTrue(!emergency, "not emergency");
        assertTrue(vault.isEvidenceRecorded(update.evidenceHash), "evidence recorded");
    }
}
