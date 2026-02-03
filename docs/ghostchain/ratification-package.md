# GhostChain Ratification Package

## Ratification and Canonicalization

### Ratification Process

This document shall become the supreme constitutional authority of GhostChain upon completion of the following steps:

1. Publication Lock - The document text is frozen and hashed (SHA-256).
2. Human Review Window - A mandatory review period where stewards, validators, and designated governors may propose edits.
3. Final Amendment Merge - Approved edits are merged into Version 1.0 (Final).
4. Governance Vote - Ratification proposal submitted and voted on under constitutional quorum rules.
5. Timelock Period - Enforced delay prior to activation.
6. Canonical Seal - Constitution hash recorded as the canonical reference.

### Canonical Hash

Upon ratification, the following hash shall represent the authoritative version of this Constitution:

```
CONSTITUTION_HASH = 0x1b3c479b7f8f1a6e67ac40798d56bde7509c68d7760c17a14fc7ba9cc907f816
```

### Signatories (Human Authority)

The following roles must attest to ratification:

- Lead Steward / Founder
- Validator Council Representative(s)
- Governance Council Chair
- Independent Witness / Auditor (optional)

Signatures may be cryptographic or written, but must be verifiable.

### Effective Date

This Constitution becomes effective immediately after timelock completion.

### Supremacy Clause

This Constitution supersedes all prior protocol rules, policies, and informal practices. All future evolution of GhostChain must occur through amendments to this document.

Document Status: Devnet ratified (2026-02-03). Production ratification pending.  
Version: 1.0 (Ratified on devnet)  
Canonical Authority: Human Governance

## Ratification Package (Steps 1-5)

### Step 1 - Constitution Hash and Seal

The canonical text of this document (Parts I-IV inclusive) shall be hashed using SHA-256 at the moment of ratification.

```
ALGORITHM: SHA-256
CANONICAL_TEXT_SCOPE: Parts I-IV (inclusive)
CONSTITUTION_HASH: 0x1b3c479b7f8f1a6e67ac40798d56bde7509c68d7760c17a14fc7ba9cc907f816
```

Devnet on-chain binding evidence (L1):
- AIConstitutionalProposal: `0xDC11f7E700A4c898AE5CAddB1082cFfa76512aDD`
- Governor: `0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6`
- Executor: `0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650`
- Proposal ID: `0`
- Proposal tx: `0xa8a8128883a93dc3b828ed772cd848724bc08e0257df5516b71c3addb0585f19`
- Ratified at: `2026-02-03 10:19:01Z`
- Activates at: `2026-02-05 10:19:01Z`

Verification checklist (devnet):
1. Code present at `AIConstitutionalProposal` address (eth_getCode != 0x).
2. `constitutionHash()` matches the canonical hash above.
3. `ratified()` returns `true` and `ratificationProposalId()` returns `0`.
4. `ratifiedAt()` and `activatesAt()` match the timestamps above.
5. Governor `proposalsLength()` is `>= 1` and proposal `0` exists.
6. Addresses match `services/stack.env` and the reports in `contracts/reports/`.

On-chain binding evidence must be captured in:

- docs/ghostchain/constitution_binding.sig
- docs/ghostchain/constitution_events.md

A signed manifest shall accompany the hash, containing:

- Document title and version
- Hash value
- Timestamp (UTC)
- Signatory identities
- Verification instructions

### Phase 0 - Calldata Generation (AIConstitutionalProposal)

Generate the on-chain ratification calldata (and optional executor bundle) using the canonical script.

Required inputs (in `services/stack.env` or environment overrides):
- `CONSTITUTION_PROPOSAL_ID` (governance proposal id)
- `AI_CONSTITUTION_PROPOSAL_ADDRESS` (deployed AIConstitutionalProposal)
- `CONSTITUTION_HASH` (defaults to `docs/ghostchain/charter.md` SHA-256 if unset)
- `AI_CONSTITUTION_EXECUTOR` (optional; executor/timelock address)

Optional overrides:
- `STACK_ENV_FILE` (alternate env file path)
- `CONSTITUTION_DOC_PATH` (alternate constitution document path)
- `CONSTITUTION_DESCRIPTION` (proposal description text)
- `AI_CONSTITUTION_PROPOSAL_OUTPUT` (output json path)
- `PROPOSAL_EXECUTOR_MODE` (executor mode, if supported)

Command:

```bash
cd contracts
npx ts-node scripts/governance/build_ai_constitutional_proposal.ts
```

Outputs:
- `contracts/reports/ai_constitutional_proposal.json`
  - `ratificationTx.data` (direct calldata)
  - `executor.calldata` (if `AI_CONSTITUTION_EXECUTOR` provided)

Latest devnet calldata snapshot (proposal id 1):

```
ratify calldata:
0x2d782f7f00000000000000000000000000000000000000000000000000000000000000011b3c479b7f8f1a6e67ac40798d56bde7509c68d7760c17a14fc7ba9cc907f816

executor calldata:
0x47e1da2a000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000dc11f7e700a4c898ae5caddb1082cffa76512add000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000442d782f7f00000000000000000000000000000000000000000000000000000000000000011b3c479b7f8f1a6e67ac40798d56bde7509c68d7760c17a14fc7ba9cc907f81600000000000000000000000000000000000000000000000000000000

executor proposal hash:
0xc3eab1ce371b560429b7a104e810781197b5f874d664f92c684eefc96186973d

governor hash:
0xb164267dfacd514dbb08880858194c6456edd113227e12c8540e685bf7414d20
```

### Phase 0 - Vote, Queue, Execute (Governor Flow)

Submit a vote, then queue and execute the proposal (subject to timelock delay).

```bash
cd contracts
npx hardhat run --network anvil scripts/governance/vote_ai_constitutional_ratification.ts
npx hardhat run --network anvil scripts/governance/queue_execute_ai_constitutional_ratification.ts
```

Reports:
- `contracts/reports/ai_constitutional_vote.json`
- `contracts/reports/ai_constitutional_execution.json`

If execution reports `eta_not_reached`, wait for the timelock delay and rerun the queue/execute script.

### Step 2 - Governance Ratification Proposal (Template)

Title: Ratify the GhostChain Constitutional Charter v1.0

Summary:
This proposal seeks formal ratification of the GhostChain Constitutional Charter, Master Regulatory Whitepaper, and Declaration of Digital Sovereignty as the supreme governing authority of the protocol.

Scope:

- Establishes constitutional supremacy
- Locks AI to advisory-only roles
- Binds protocol evolution to governance, law, and evidence

Voting Parameters:

- Quorum: Constitutional quorum
- Voting Period: As defined by governance rules
- Approval Threshold: Constitutional majority

Timelock:

- Mandatory delay prior to activation

Execution:

- Record constitution hash as canonical reference
- Mark constitution as effective

Rollback:

- If vote fails, document remains non-binding

### Step 3 - Signature and Attestation Page

Ratification Attestations

By signing below, the undersigned attest that this Constitution was reviewed, approved, and ratified in accordance with GhostChain governance procedures.

- Lead Steward / Founder: ________________________  Date: ________
- Validator Council Representative: _______________  Date: ________
- Governance Council Chair: ______________________  Date: ________
- Independent Witness / Auditor (optional): ________  Date: ________

Signatures may be handwritten or cryptographic. All signatures must be verifiable.

### Step 4 - Print-Ready Documents

The following print-ready artifacts are authorized:

1. GhostChain Constitutional Charter (Formal PDF)
   - Legal formatting
   - Pagination and section numbering
   - Signature page included
2. Regulator-Facing Master Whitepaper (PDF)
   - Plain-language compliance explanation
   - Governance and AI boundaries
   - Audit and evidence assurances
3. Declaration of Digital Sovereignty (Standalone PDF)
   - Public-facing declaration
   - Philosophical and ethical commitments

### Step 5 - Regulator and Auditor Package

A regulator-ready package shall include:

- Executive summary
- Constitutional Charter
- Master Whitepaper
- Declaration of Digital Sovereignty
- Evidence and auditability overview
- Contact and governance liaison information

Purpose:
To enable independent assessment by regulators, auditors, courts, or partners without requiring protocol modification.

Ratification Status: Devnet ratified; production pending  
Next Action: Produce production ratification vote and timelock activation

### Production Ratification Checklist

1. Confirm `CONSTITUTION_HASH` matches the production charter text and is pinned in `services/stack.env`.
2. Deploy `AIConstitutionalProposal` on production L1 and record:
   - contract address
   - deployment tx hash
   - deployer address
3. Submit governance proposal via production governor:
   - proposal id
   - proposal tx hash
4. Ensure quorum and supermajority thresholds are met.
5. Queue proposal in the executor/timelock and wait for delay to elapse.
6. Execute the proposal and verify:
   - `ratified()` returns `true`
   - `constitutionHash()` matches canonical hash
   - `activatesAt()` equals ratifiedAt + activationDelay
7. Update the following artifacts:
   - `contracts/reports/ai_constitutional_deployment.json`
   - `contracts/reports/ai_constitutional_proposal.json`
   - `contracts/reports/ai_constitutional_proposal_id.json`
   - `docs/ghostchain/ratification-package.md`
8. Archive signatures and evidence:
   - `docs/ghostchain/constitution_binding.sig`
   - `docs/ghostchain/constitution_events.md`
9. Re-run `infra/scripts/gates/l1-go-no-go.sh` and archive the evidence pack.

### Step 6 - Final Attestations

Upon ratification and proof publication, the following attestations must be signed:

- docs/ghostchain/final_economic_sovereignty_attestation.md
- docs/ghostchain/final_constitutional_monetary_attestation.md
