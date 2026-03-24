export default function GovernanceOpsPage() {
  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>Governance Operations</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          Creating, reviewing, ratifying, and executing governance proposals on GhostChain
        </div>
      </div>

      <div className="wp-section" id="overview">
        <div className="wp-h2">1. Overview</div>
        <div className="wp-p">
          GhostStack governance uses <strong>GhostChainGovernor.sol</strong> — a custom governor
          (not OpenZeppelin Governor). An AI layer (GIE, port 9975) can draft proposals, but
          humans must ratify them via governance quorum. No autonomous on-chain execution.
        </div>
        <div className="wp-callout wp-callout-warn">
          ⚠️ Never modify validator quorum, token supply logic, or bridge validator quorum
          without a governance proposal that has achieved quorum.
        </div>
      </div>

      <div className="wp-section" id="lifecycle">
        <div className="wp-h2">2. Proposal Lifecycle</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Stage</th><th>Duration</th><th>Description</th></tr></thead>
            <tbody>
              {[
                ["Draft",       "—",       "AI or human creates proposal with on-chain calldata"],
                ["Review",      "48 hours","Community review period, discussion, amendments"],
                ["Vote",        "7 days",  "Stake-weighted voting — For / Against / Abstain"],
                ["Timelock",    "48 hours","Delay between pass and execution (emergency: 90% quorum bypasses)"],
                ["Execution",   "—",       "Governor contract executes the approved on-chain action"],
                ["Cancelled",   "—",       "Proposer or governance multisig cancels before execution"],
              ].map(([s, d, desc]) => (
                <tr key={s}><td style={{ fontWeight: 600 }}>{s}</td><td style={{ fontFamily: "monospace", color: "var(--amber)" }}>{d}</td><td>{desc}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wp-section" id="create">
        <div className="wp-h2">3. Creating a Proposal</div>
        <div className="wp-h3">3.1 Via CLI (cast)</div>
        <div className="wp-code">{`# Encode proposal calldata
cast calldata "transfer(address,uint256)" 0xRECEIVER 1000000000000000000

# Submit proposal (requires governance role or sufficient stake)
cast send $GOVERNOR_ADDRESS \\
  "propose(address[],uint256[],bytes[],string)" \\
  "[0xTARGET]" "[0]" "[0xCALLDATA]" "Proposal Title: description" \\
  --rpc-url http://localhost:18545 \\
  --private-key $PROPOSER_KEY`}</div>

        <div className="wp-h3">3.2 Via ghost-sdk-core</div>
        <div className="wp-code">{`import { GhostGovernance } from "@ghostchain/ghost-sdk-core";

const gov = new GhostGovernance({ provider: l1, signer: wallet });

const proposalId = await gov.propose({
  targets:     ["0xTREASURY"],
  values:      [0n],
  calldatas:   [encodedCalldata],
  description: "Increase reward distribution by 5%",
});
console.log("Proposal ID:", proposalId);`}</div>

        <div className="wp-h3">3.3 Via AI (GIE draft)</div>
        <div className="wp-code">{`# Request AI-drafted proposal from Governance Impact Engine
curl -X POST http://localhost:9975/proposals/draft \\
  -H "Authorization: Bearer $GIE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "Adjust validator commission cap to 10%",
    "context": "Current commission cap at 5% is limiting validator participation"
  }'
# Returns: { proposalId, calldata, targets, description, impact_analysis }
# MUST be reviewed and submitted by a human — GIE cannot self-submit`}</div>
      </div>

      <div className="wp-section" id="vote">
        <div className="wp-h2">4. Voting</div>
        <div className="wp-code">{`# 1 = For, 0 = Against, 2 = Abstain
cast send $GOVERNOR_ADDRESS \\
  "castVote(uint256,uint8)" $PROPOSAL_ID 1 \\
  --rpc-url http://localhost:18545 \\
  --private-key $VOTER_KEY

# Check quorum (67% required to pass)
cast call $GOVERNOR_ADDRESS \\
  "quorumNumerator()" \\
  --rpc-url http://localhost:18545
# Returns 67`}</div>
      </div>

      <div className="wp-section" id="execute">
        <div className="wp-h2">5. Execution</div>
        <div className="wp-code">{`# After timelock expires, execute the proposal
cast send $GOVERNOR_ADDRESS \\
  "execute(address[],uint256[],bytes[],bytes32)" \\
  "[$TARGET]" "[0]" "[$CALLDATA]" $DESCRIPTION_HASH \\
  --rpc-url http://localhost:18545 \\
  --private-key $EXECUTOR_KEY`}</div>
      </div>

      <div className="wp-section" id="constitution">
        <div className="wp-h2">6. Constitutional Amendments</div>
        <div className="wp-p">
          The GhostConstitution requires a ZK proof + supermajority (&gt;75%) to amend a clause.
          This is the highest governance action in the protocol.
        </div>
        <div className="wp-code">{`# Generate ZK proof (uses Noir circuit from contracts/circuits/)
node tools/governance/generateAmendmentProof.js \\
  --clause-id 3 \\
  --new-text "Updated clause text" \\
  --witness witness.json

# Submit constitutional amendment proposal
forge script script/ProposeConstitutionalAmendment.s.sol \\
  --rpc-url http://localhost:18545 \\
  --broadcast \\
  --private-key $COUNCIL_KEY`}</div>
      </div>

      <div className="wp-section" id="preflight">
        <div className="wp-h2">7. Pre-Deployment Checks</div>
        <div className="wp-code">{`# Mandatory before deploying any governance contract
npm run phase2:preflight

# Verify branding audit passes
npm run brand:full

# Dry-run the proposal (VM_MANAGER_DRY_RUN=1 for infra actions)
VM_MANAGER_DRY_RUN=1 node tools/governance/simulate.js --proposal $PROPOSAL_ID`}</div>
      </div>
    </div>
  );
}
