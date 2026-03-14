// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/governance/Governor.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/common/GST20.sol";

contract GovToken is GST20 {
    constructor() GST20("Gov", "GOV", 18) {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract GovernanceEchidna {
    GovToken private token;
    ProposalExecutor private executor;
    Governor private governor;

    constructor() {
        token = new GovToken();
        executor = new ProposalExecutor(1 days);
        governor = new Governor(token, executor);
    }

    function echidna_executor_only_governor() public returns (bool) {
        try executor.execute(0) {
            return false;
        } catch {
            return true;
        }
    }
}
