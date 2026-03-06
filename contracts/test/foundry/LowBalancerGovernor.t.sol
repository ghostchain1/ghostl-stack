// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/common/ERC20.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/governance/LowBalancerGovernor.sol";
import "../../src/common/ConstitutionalGuard.sol";
import "../../src/ai/EvidenceBundle.sol";

contract GovToken is ERC20 {
    constructor() ERC20("Gov", "GOV", 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PermitAllConstitution {
    function isActionPermitted(bytes32) external pure returns (bool) {
        return true;
    }
}

contract Box {
    uint256 public value;

    function setValue(uint256 v) external {
        value = v;
    }
}

contract LowBalancerGovernorTest is TestBase {
    function testVoteRequiresStakeAndLocksWithdrawal() public {
        GovToken token = new GovToken();
        ProposalExecutor executor = new ProposalExecutor(0);
        LowBalancerGovernor governor = new LowBalancerGovernor(token, executor, 1 days, 0);

        address alice = address(0xA11CE);
        token.mint(alice, 100 * GST_UNIT);

        uint256 id = governor.propose(address(0xCAFE), 0, hex"");

        vm.prank(alice);
        vm.expectRevert(bytes("no stake"));
        governor.vote(id, true);

        vm.prank(alice);
        token.approve(address(governor), 100 * GST_UNIT);
        vm.prank(alice);
        governor.stake(100 * GST_UNIT);

        vm.prank(alice);
        governor.vote(id, true);

        (, , , , , , uint64 end, , , , ) = governor.proposals(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LowBalancerGovernor.Locked.selector, end));
        governor.withdraw(1 * GST_UNIT);

        vm.warp(uint256(end) + 1);
        vm.prank(alice);
        governor.withdraw(1 * GST_UNIT);
        assertEq(token.balanceOf(alice), 1 * GST_UNIT, "withdrawn");
    }

    function testQueueRequiresQuorum() public {
        GovToken token = new GovToken();
        ProposalExecutor executor = new ProposalExecutor(0);
        LowBalancerGovernor governor = new LowBalancerGovernor(token, executor, 1 days, 8000);

        address alice = address(0xA11CE);
        token.mint(alice, 60 * GST_UNIT);
        token.mint(address(0xB0B), 40 * GST_UNIT); // totalSupply = 100

        vm.prank(alice);
        token.approve(address(governor), 60 * GST_UNIT);
        vm.prank(alice);
        governor.stake(60 * GST_UNIT);

        uint256 id = governor.propose(address(0xCAFE), 0, hex"");
        vm.prank(alice);
        governor.vote(id, true);

        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(LowBalancerGovernor.QuorumNotMet.selector);
        governor.queue(id);
    }

    function testQueueAndExecuteUpdatesTarget() public {
        GovToken token = new GovToken();
        ProposalExecutor executor = new ProposalExecutor(0);

        EvidenceBundle bundle = new EvidenceBundle(address(this), address(0), EvidenceAnchor(address(0)));
        PermitAllConstitution constitution = new PermitAllConstitution();
        ConstitutionalGuard guard = new ConstitutionalGuard(address(this), address(0), address(constitution));

        address origin = tx.origin;
        vm.prank(origin);
        executor.setEvidenceBundle(bundle);
        vm.prank(origin);
        executor.setConstitutionalGuard(guard);

        LowBalancerGovernor governor = new LowBalancerGovernor(token, executor, 1 days, 5000);

        address alice = address(0xA11CE);
        token.mint(alice, 60 * GST_UNIT);
        token.mint(address(0xB0B), 40 * GST_UNIT); // totalSupply = 100

        vm.prank(alice);
        token.approve(address(governor), 60 * GST_UNIT);
        vm.prank(alice);
        governor.stake(60 * GST_UNIT);

        Box box = new Box();
        bytes memory data = abi.encodeWithSelector(Box.setValue.selector, 123);

        uint256 id = governor.propose(address(box), 0, data);
        vm.prank(alice);
        governor.vote(id, true);

        vm.warp(block.timestamp + 1 days + 1);
        governor.queue(id);
        governor.execute(id);

        assertEq(box.value(), 123, "box value updated");
    }

    function testGovernorParamsOnlyExecutor() public {
        GovToken token = new GovToken();
        ProposalExecutor executor = new ProposalExecutor(0);
        LowBalancerGovernor governor = new LowBalancerGovernor(token, executor, 1 days, 0);

        vm.expectRevert(LowBalancerGovernor.NotExecutor.selector);
        governor.setQuorumBps(100);

        vm.prank(address(executor));
        governor.setQuorumBps(100);
        assertEq(uint256(governor.quorumBps()), 100, "quorum updated");
    }
}
