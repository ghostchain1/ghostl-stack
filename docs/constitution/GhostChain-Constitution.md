# GhostChain Constitution

Version: 1.0.0  
Status: Governance-controlled constitutional artifact

## Preamble

GhostChain is a sovereign, governance-led network with layered execution:

- `L3 -> L2 -> L1` routing is mandatory.
- `L1` is the constitutional and settlement root.
- Treasury execution is governance-gated and timelocked.

## Constitutional Clauses

1. Routing Law  
   L3 traffic MUST settle through L2 before L1.  
   No direct L3-to-L1 settlement path is allowed.

2. Treasury Law  
   Treasury capital deployment MUST be initiated from L1 only.

3. Governance Law  
   Any mainnet release MUST have an approved governance proposal, quorum confirmation, and expired execution timelock.

4. Solvency Law  
   Treasury obligations MUST NOT exceed treasury assets over validated solvency epochs.

5. Federation Law  
   Federation members MAY receive policy-governed distributions but MUST NOT have direct withdrawal rights from the root treasury.

6. AI Governor Law  
   AI systems MAY draft and rank strategies; they MUST NOT execute capital movement directly.

7. Release Law  
   Mainnet launch MUST remain blocked unless constitutional hash, release manifest hash, attestation hash, and proposal hash are approved by governance and verified on-chain.

## Change Control

- Any modification to this document requires an L1 governance proposal and timelock execution.
- The SHA-256 hash of this file is a canonical constitutional identifier used by `ReleaseGate`.
