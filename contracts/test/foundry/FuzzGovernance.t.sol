// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/Governor.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/common/GST20.sol";
import "../../src/common/Ownable.sol";

contract GovToken is GST20, GhostBrand {
    constructor() GST20("Gov", "GOV", 18) {
        _mint(msg.sender, 1_000_000 * GST_UNIT);
    }
}

contract FuzzGovernance is TestBase {
    GovToken private token;
    ProposalExecutor private executor;
    Governor private governor;

    function setUp() public {
        token = new GovToken();
        executor = new ProposalExecutor(1 days);
        governor = new Governor(token, executor);
    }

    function testFuzz_onlyGovernorExecutes(uint256 id) public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("not governor"));
        executor.execute(id);
    }

    function testFuzz_queueRequiresOwner(address target, uint256 value, bytes calldata data) public {
        governor.propose(target, value, data);
        vm.prank(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        governor.queue(0);
    }

    function testQueueOrderEnforced() public {
        governor.propose(address(0xCAFE), 0, hex"");
        governor.propose(address(0xBEEF), 0, hex"");
        governor.vote(1, true);
        vm.expectRevert(bytes("queue mismatch"));
        governor.queue(1);
    }
}
