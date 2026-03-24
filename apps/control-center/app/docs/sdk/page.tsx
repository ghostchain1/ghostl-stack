export default function SDKDocsPage() {
  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>ghost-sdk-core</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          The native GhostStack SDK — no ethers.js dependency, full type safety
        </div>
      </div>

      <div className="wp-section">
        <div className="wp-callout">
          <strong>New code must use ghost-sdk-core.</strong> The legacy <code>ghost-sdk</code>
          (ethers v6 wrapper) is acceptable only for existing integrations.
          Never import <code>ethers</code> or <code>web3</code> directly in application code.
        </div>
      </div>

      <div className="wp-section" id="install">
        <div className="wp-h2">Installation</div>
        <div className="wp-code">{`# From workspace root (already included in monorepo)
npm install @ghostchain/ghost-sdk-core

# Or reference via workspace:
# package.json: "@ghostchain/ghost-sdk-core": "workspace:*"`}</div>
      </div>

      <div className="wp-section" id="provider">
        <div className="wp-h2">GhostProvider</div>
        <div className="wp-p">
          The main entry point for connecting to any GhostChain layer.
        </div>
        <div className="wp-code">{`import { GhostProvider, CHAINS } from "@ghostchain/ghost-sdk-core";

// Connect to L1
const l1 = new GhostProvider({ chainId: CHAINS.L1, rpc: "http://localhost:18545" });

// Connect to L2
const l2 = new GhostProvider({ chainId: CHAINS.L2, rpc: "http://localhost:29545" });

// Connect to L3
const l3 = new GhostProvider({ chainId: CHAINS.L3, rpc: "http://localhost:39545" });

// Basic queries
const block  = await l1.getBlockNumber();
const bal    = await l1.getGSTBalance("0xYOUR_ADDRESS");
const nonce  = await l1.getTransactionCount("0xYOUR_ADDRESS");`}</div>

        <div className="wp-h3">CHAINS constants</div>
        <div className="wp-code">{`import { CHAINS } from "@ghostchain/ghost-sdk-core";

CHAINS.L1  // 14000101
CHAINS.L2  // 901
CHAINS.L3  // 903`}</div>
      </div>

      <div className="wp-section" id="wallet">
        <div className="wp-h2">GhostWallet</div>
        <div className="wp-code">{`import { GhostWallet, parseGST, formatGST } from "@ghostchain/ghost-sdk-core";

const wallet = new GhostWallet(process.env.PRIVATE_KEY!, provider);

// Send GST
const tx = await wallet.sendGST({ to: "0xRECEIVER", value: parseGST("10") });
const receipt = await tx.wait();

// Read balance in human-readable form
const raw = await provider.getGSTBalance(wallet.address);
console.log(formatGST(raw)); // "10.0 GST"

// Sign arbitrary data
const sig = await wallet.signMessage("hello ghostchain");`}</div>
      </div>

      <div className="wp-section" id="contracts">
        <div className="wp-h2">Contract Interaction</div>
        <div className="wp-code">{`import { GhostContract } from "@ghostchain/ghost-sdk-core";
import GhostChainGovernorABI from "@ghostchain/ghost-sdk-core/abis/GhostChainGovernor";

const governor = new GhostContract({
  address: "0xGOVERNOR_ADDRESS",
  abi:     GhostChainGovernorABI,
  provider: l1,
  signer:   wallet,   // optional for reads
});

// Read
const quorum = await governor.call("quorumNumerator");

// Write (requires signer)
const tx = await governor.send("castVote", [proposalId, 1 /* For */]);
await tx.wait();`}</div>
      </div>

      <div className="wp-section" id="bridge">
        <div className="wp-h2">Cross-Chain Bridging</div>
        <div className="wp-callout wp-callout-warn">
          Routing law is enforced: L3 → L2 → L1 only. Direct L3 → L1 calls are rejected.
        </div>
        <div className="wp-code">{`import { GhostBridge, CHAINS } from "@ghostchain/ghost-sdk-core";

// L2 → L1 bridge
const bridge = new GhostBridge({ fromChain: CHAINS.L2, toChain: CHAINS.L1 });
const tx = await bridge.bridge({
  amount:  parseGST("50"),
  to:      "0xRECEIVER",
  signer:  wallet,
});
await tx.wait();

// L3 → L2 bridge (L3 → L1 directly will throw RoutingLawViolation)
const l3bridge = new GhostBridge({ fromChain: CHAINS.L3, toChain: CHAINS.L2 });`}</div>
      </div>

      <div className="wp-section" id="gns">
        <div className="wp-h2">GNS — Ghost Name System</div>
        <div className="wp-code">{`import { GNSClient } from "@ghostchain/ghost-sdk-core";

const gns = new GNSClient({ provider: l1 });

// Resolve a .ghost name to address
const address = await gns.resolve("alice.ghost");

// Register a name (costs GST)
const tx = await gns.register({
  name:    "myname.ghost",
  years:   1,
  signer:  wallet,
});`}</div>
      </div>

      <div className="wp-section" id="errors">
        <div className="wp-h2">Error Types</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Error Class</th><th>When thrown</th></tr></thead>
            <tbody>
              {[
                ["RoutingLawViolation",  "Cross-chain call violates L3→L2→L1 routing rule"],
                ["ChainMismatch",        "Provider chainId does not match expected layer"],
                ["GSTLeakage",           "Attempt to integrate a non-GST token"],
                ["GhostRPCError",        "ghost_ RPC call returns an error response"],
                ["InsufficientGST",      "Balance too low for the requested operation"],
              ].map(([e, d]) => (
                <tr key={e}><td style={{ fontFamily: "monospace", color: "var(--red)", fontSize: "0.82rem" }}>{e}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
