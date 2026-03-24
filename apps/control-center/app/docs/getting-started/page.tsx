export default function GettingStartedPage() {
  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>Getting Started with GhostStack</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          Set up a local devnet, connect to the chains, interact with contracts and the SDK
        </div>
      </div>

      <div className="wp-section" id="prerequisites">
        <div className="wp-h2">1. Prerequisites</div>
        <ul className="wp-ul">
          <li><strong>Node.js</strong> ≥ 22.21.0 &lt; 23 (enforced via preinstall hook)</li>
          <li><strong>npm</strong> 10.9.4 (canonical — do not use pnpm/yarn)</li>
          <li><strong>Docker</strong> + <strong>Docker Compose</strong> v2</li>
          <li><strong>Foundry</strong> (forge + cast + anvil) — for contract dev</li>
          <li><strong>Go</strong> ≥ 1.21 (for ghostchaind Cosmos SDK binary)</li>
        </ul>
        <div className="wp-callout">
          On Linux, install the correct Node.js version via nvm:
          <div className="wp-code">{`nvm install 22.21.0
nvm use 22.21.0
node -v  # must print v22.21.x`}</div>
        </div>
      </div>

      <div className="wp-section" id="install">
        <div className="wp-h2">2. Installation</div>
        <div className="wp-code">{`# Clone the repo
git clone https://github.com/ghostchain/ghostl-stack
cd ghostl-stack

# Copy environment template
cp stack.env.example .env
# Edit .env — set POSTGRES_PASSWORD and COMPLIANCE_JWT_SECRET

# Install all workspace dependencies
npm install

# Verify installation
node -e "require('./packages/ghost-sdk-core')"  # should not throw`}</div>
      </div>

      <div className="wp-section" id="devnet">
        <div className="wp-h2">3. Start the Devnet</div>
        <div className="wp-p">
          The devnet brings up GhostChain L1, GhostL2, GhostL3, GhostBrain, and supporting services:
        </div>
        <div className="wp-code">{`# Start the full devnet stack
docker compose up -d

# Verify all chains are up
cast chain-id --rpc-url http://localhost:18545   # 14000101 (L1)
cast chain-id --rpc-url http://localhost:29545   # 901      (L2)
cast chain-id --rpc-url http://localhost:39545   # 903      (L3)

# Check GhostBrain health
curl http://localhost:7900/health`}</div>

        <div className="wp-h3">3.1 Preflight Checks (mandatory before L2/L3 start)</div>
        <div className="wp-code">{`npm run preflight:opstack   # validate L2/L3 chain configs
npm run env:sync:opstack    # sync env after L1 deployment
npm run env:sync:opstack:l3 # sync env after L2 deployment`}</div>
      </div>

      <div className="wp-section" id="SDK">
        <div className="wp-h2">4. Connect via ghost-sdk-core</div>
        <div className="wp-p">
          New integrations should use <code>ghost-sdk-core</code> (no ethers dependency):
        </div>
        <div className="wp-code">{`import { GhostProvider, CHAINS } from "@ghostchain/ghost-sdk-core";

const provider = new GhostProvider({
  chainId: CHAINS.L1,           // 14000101
  rpc: "http://localhost:18545",
});

const blockNumber = await provider.getBlockNumber();
const gstBalance  = await provider.getGSTBalance("0xYOUR_ADDRESS");
console.log({ blockNumber, gstBalance });`}</div>

        <div className="wp-h3">4.1 Send a GST Transfer</div>
        <div className="wp-code">{`import { GhostWallet, parseGST } from "@ghostchain/ghost-sdk-core";

const wallet = new GhostWallet(process.env.PRIVATE_KEY, provider);

const tx = await wallet.sendGST({
  to:    "0xRECEIVER",
  value: parseGST("10"),  // 10 GST
});
await tx.wait();
console.log("Sent:", tx.hash);`}</div>
      </div>

      <div className="wp-section" id="contracts">
        <div className="wp-h2">5. Deploy a Contract</div>
        <div className="wp-code">{`cd contracts

# Compile
forge build

# Run tests
forge test

# Deploy to local L1 devnet (chain_id 14000101)
forge script script/DeployExample.s.sol \\
  --rpc-url http://localhost:18545 \\
  --broadcast \\
  --private-key $PRIVATE_KEY`}</div>

        <div className="wp-callout wp-callout-warn">
          Never deploy to chain IDs other than 14000101, 901, or 903.
          <code>hardhat.config.ts</code> enforces this and rejects other chain IDs at compile time.
        </div>
      </div>

      <div className="wp-section" id="next">
        <div className="wp-h2">6. Next Steps</div>
        <ul className="wp-ul">
          <li>Read the <a href="/docs/architecture" style={{ color: "var(--cyan)" }}>Architecture Guide</a> for a deep-dive on the 3-layer protocol</li>
          <li>Check the <a href="/docs/api" style={{ color: "var(--cyan)" }}>API Reference</a> for all service endpoints</li>
          <li>Explore <a href="/docs/contracts" style={{ color: "var(--cyan)" }}>Smart Contracts</a> for ABI details</li>
          <li>Browse the <a href="/docs/sdk" style={{ color: "var(--cyan)" }}>ghost-sdk-core docs</a> for full SDK API</li>
          <li>Visit the <a href="/user" style={{ color: "var(--cyan)" }}>User Portal</a> to manage your wallet, stake, and governance votes</li>
        </ul>
      </div>
    </div>
  );
}
