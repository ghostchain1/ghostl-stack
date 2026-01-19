// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/Governor.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/common/ERC20.sol";

contract GovToken is ERC20 {
    constructor() ERC20("Gov", "GOV", 18) {
        _mint(msg.sender, 1_000_000 ether);
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
        vm.expectRevert(bytes("not owner"));
        governor.queue(0);
    }
}
