// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/governance/Governor.sol";
import "../../src/governance/ProposalExecutor.sol";
import "../../src/common/ERC20.sol";

contract GovToken is ERC20 {
    constructor() ERC20("Gov", "GOV", 18) {
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
