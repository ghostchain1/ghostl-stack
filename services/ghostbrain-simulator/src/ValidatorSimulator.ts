/**
 * ValidatorSimulator — models consensus resilience and attack scenarios.
 */
export interface ValidatorAttackResult {
  totalValidators:   number;
  compromised:       number;
  networkSafe:       boolean;
  recommendation:    string;
}

export class ValidatorSimulator {
  simulateAttack(totalValidators: number, attackerCount: number): ValidatorAttackResult {
    const safeThreshold = Math.floor(totalValidators / 3);
    const networkSafe   = attackerCount < safeThreshold;

    return {
      totalValidators,
      compromised:    attackerCount,
      networkSafe,
      recommendation: networkSafe
        ? "monitor_and_rotate_keys"
        : "emergency_validator_redistribution",
    };
  }

  simulateSlashing(validators: number, slashRate: number): { slashed: number; rewardImpact: number } {
    const slashed      = Math.floor(validators * slashRate);
    const rewardImpact = slashed * 0.02;   // 2% reward reduction per slashed validator
    return { slashed, rewardImpact };
  }

  optimalValidatorCount(targetFaultTolerance: number): number {
    // BFT: need 3f+1 validators to tolerate f faults
    return Math.ceil(3 * targetFaultTolerance + 1);
  }
}
