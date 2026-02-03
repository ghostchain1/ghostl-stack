// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/common/ERC20.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/governance/Governor.sol";
import "../../src/governance/AIConstitutionalProposal.sol";

contract MockToken is ERC20 {
    constructor() ERC20("MockGov", "MGOV", 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AIConstitutionalProposalTest is TestBase {
    function testRatifyRequiresSupermajorityAndDelay() public {
        MockToken token = new MockToken();
        ProposalExecutor executor = new ProposalExecutor(0);
        Governor governor = new Governor(token, executor);

        AIConstitutionalProposal proposal = new AIConstitutionalProposal(
            address(governor),
            address(this),
            6667,
            5000,
            2 days,
            1500,
            keccak256("ghost.ai.emergency.policy"),
            1 days
        );

        address alice = address(0xA11CE);
        address bob = address(0xB0B);
        token.mint(alice, 1000 ether);
        token.mint(bob, 500 ether);

        uint256 id = governor.proposalsLength();
        bytes memory data = abi.encodeWithSelector(proposal.ratify.selector, id, bytes32(uint256(123)));
        governor.propose(address(proposal), 0, data);

        vm.prank(alice);
        governor.vote(id, true);

        vm.warp(block.timestamp + governor.votingPeriod() + 1);
        vm.expectRevert(AIConstitutionalProposal.BelowSupermajority.selector);
        proposal.ratify(id, bytes32(uint256(123)));

        uint256 id2 = governor.proposalsLength();
        bytes memory data2 = abi.encodeWithSelector(proposal.ratify.selector, id2, bytes32(uint256(456)));
        governor.propose(address(proposal), 0, data2);

        vm.prank(alice);
        governor.vote(id2, true);
        vm.prank(bob);
        governor.vote(id2, true);

        vm.warp(block.timestamp + governor.votingPeriod() + 1);
        proposal.ratify(id2, bytes32(uint256(456)));

        assertTrue(!proposal.isActive(), "not active before delay");
        vm.warp(block.timestamp + 2 days + 1);
        assertTrue(proposal.isActive(), "active after delay");
        assertTrue(proposal.forbiddenAction(proposal.FORBIDDEN_FINALITY()), "finality forbidden");
    }
}
