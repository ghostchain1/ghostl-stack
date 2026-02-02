// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/ai/AIGovernanceEscalation.sol";

contract EscalationTarget {
    uint256 public value;

    function setValue(uint256 newValue) external {
        value = newValue;
    }
}

contract EscalationEchidna {
    AIGovernanceEscalation private escalation;
    EscalationTarget private target;

    constructor() {
        escalation = new AIGovernanceEscalation(address(this), address(0));
        escalation.setSubmitter(address(this), true);
        escalation.setThresholds(1, 1);
        escalation.setLimits(0, 1 days, 0);
        target = new EscalationTarget();
    }

    function echidna_escalation_never_executes() public returns (bool) {
        uint256 beforeValue = target.value();
        escalation.submitIntent(
            bytes32("bundle"),
            10_000,
            10_000,
            address(target),
            0,
            abi.encodeWithSelector(target.setValue.selector, 123)
        );
        return target.value() == beforeValue;
    }
}
