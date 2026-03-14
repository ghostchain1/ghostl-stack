// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";

import "../../src/common/XDomainMessenger.sol";

import "../../src/governance/FederationCouncil.sol";
import "../../src/governance/FederatedTimelock.sol";
import "../../src/governance/ProposalAttestor.sol";

import "../../src/governance/bridge/DevOnlyFinalityVerifier.sol";
import "../../src/governance/bridge/IFederationMessageSender.sol";
import "../../src/governance/bridge/XDomainFederationClearanceAdapter.sol";
import "../../src/governance/bridge/XDomainFederationCouncilAdapter.sol";

contract Counter {
    uint256 public n;
    function inc() external { n += 1; }
}

contract FederationGovernanceTest is TestBase {
    function testAttestationClearanceFlow_AllowsConstitutionalExecution() public {
        // --- Setup: cyclic messenger wiring for dev/test ---
        XDomainMessenger l1Messenger = new XDomainMessenger(address(0), address(0));
        XDomainMessenger l2Messenger = new XDomainMessenger(address(0), address(0));
        l1Messenger.setParentMessenger(address(l2Messenger));
        l2Messenger.setParentMessenger(address(l1Messenger));

        // --- L1 ---
        FederationCouncil council = new FederationCouncil(address(this), address(0));
        DevOnlyFinalityVerifier finalityVerifier = new DevOnlyFinalityVerifier();
        XDomainFederationCouncilAdapter l1Adapter = new XDomainFederationCouncilAdapter(l1Messenger, council, 2);

        // --- L2 ---
        FederatedTimelock l2Timelock = new FederatedTimelock(address(this), address(0x1111));
        XDomainFederationClearanceAdapter clearanceAdapter =
            new XDomainFederationClearanceAdapter(l2Messenger, l2Timelock, address(l1Adapter));
        l2Timelock.setClearanceAdapter(address(clearanceAdapter));

        ProposalAttestor attestor =
            new ProposalAttestor(2, IFederationMessageSender(address(l2Messenger)), address(l1Adapter), address(this));

        // Configure L1 council for domain=2.
        FederationCouncil.DomainConfig memory cfg = FederationCouncil.DomainConfig({
            enabled: true,
            adapter: address(l1Adapter),
            attestor: address(attestor),
            requireGovernanceApproval: false,
            clearanceTarget: address(clearanceAdapter),
            clearanceMinGasLimit: 150_000,
            finalityVerifier: address(finalityVerifier),
            requireFinalityVerification: true
        });
        council.configureDomain(2, cfg);

        // --- Attest ---
        bytes32 proposalSalt = keccak256("L2.CONSTITUTIONAL.PROPOSAL.1");
        Counter counter = new Counter();

        address[] memory targets = new address[](1);
        targets[0] = address(counter);
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(Counter.inc, ());

        bytes32 descriptionHash = keccak256(bytes("L2 constitutional change: increment counter"));
        bytes32 finalityProofHash = keccak256(bytes("finality-proof-commitment"));

        bytes32 attHash = attestor.attestProposal(
            proposalSalt, targets, values, calldatas, descriptionHash, finalityProofHash, 150_000
        );

        // L2 should have the clearance recorded after auto-clearance.
        assertEq(l2Timelock.clearedAttestationHash(proposalSalt), attHash, "clearance hash");

        // --- Schedule and execute constitutional operation ---
        l2Timelock.markConstitutional(proposalSalt, true);
        l2Timelock.schedule(address(counter), 0, calldatas[0], proposalSalt, 0);
        l2Timelock.executeConstitutional(address(counter), 0, calldatas[0], proposalSalt, attHash);

        assertEq(counter.n(), 1, "counter incremented");
    }

    function testExecuteConstitutional_RevertsWithoutClearance() public {
        FederatedTimelock l2Timelock = new FederatedTimelock(address(this), address(0x1111));
        bytes32 proposalSalt = keccak256("L2.CONSTITUTIONAL.PROPOSAL.2");
        Counter counter = new Counter();
        bytes memory data = abi.encodeCall(Counter.inc, ());

        l2Timelock.markConstitutional(proposalSalt, true);
        l2Timelock.schedule(address(counter), 0, data, proposalSalt, 0);

        vm.expectRevert(FederatedTimelock.ClearanceMissing.selector);
        l2Timelock.executeConstitutional(address(counter), 0, data, proposalSalt, keccak256("missing"));
    }
}
