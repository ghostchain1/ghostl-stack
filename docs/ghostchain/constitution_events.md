# Ghost Constitution Events

This file documents canonical constitutional events emitted by contracts/src/GhostConstitution.sol.

- GovernanceChanged(previousGovernance, newGovernance)
- VerifierAgentChanged(previousAgent, newAgent)
- ZKVerifierChanged(previousVerifier, newVerifier)
- ClauseAmended(clauseId, amendmentHash)
- ActionPermissioned(actionHash, allowed)
- ActionRecorded(actionHash, clauseId, proofHash)

Notes:
ActionRecorded is the constitutional event used for infra/service/validator-impacting actions.
