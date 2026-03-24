export default function DeploymentGuidePage() {
  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>Deployment Guide</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          Deploy GhostStack to devnet, testnet, or mainnet
        </div>
      </div>

      <div className="wp-section" id="devnet">
        <div className="wp-h2">1. Local Devnet</div>
        <div className="wp-code">{`# 1. Clone and configure
git clone https://github.com/ghostchain/ghostl-stack && cd ghostl-stack
cp stack.env.example .env
# Set POSTGRES_PASSWORD and COMPLIANCE_JWT_SECRET in .env

# 2. Install dependencies
npm install   # Node >=22.21.0 <23 required

# 3. Run preflight
npm run preflight:opstack

# 4. Start full devnet
docker compose up -d

# 5. Verify chains
cast chain-id --rpc-url http://localhost:18545   # → 14000101
cast chain-id --rpc-url http://localhost:29545   # → 901
cast chain-id --rpc-url http://localhost:39545   # → 903`}</div>
      </div>

      <div className="wp-section" id="contracts-deploy">
        <div className="wp-h2">2. Contract Deployment</div>
        <div className="wp-callout wp-callout-warn">
          Run <code>npm run phase2:preflight</code> before deploying any governance contract.
          Hardhat enforces chain IDs — only 14000101, 901, and 903 are accepted.
        </div>
        <div className="wp-code">{`cd contracts

# Compile
forge build

# Deploy L1 contracts
forge script script/DeployL1Core.s.sol \\
  --rpc-url http://localhost:18545 \\
  --broadcast --verify \\
  --private-key $DEPLOYER_KEY

# Sync environment after L1 deploy
cd .. && npm run env:sync:opstack

# Deploy L2 contracts
forge script script/DeployL2Core.s.sol \\
  --rpc-url http://localhost:29545 \\
  --broadcast \\
  --private-key $DEPLOYER_KEY

# Sync environment after L2 deploy
npm run env:sync:opstack:l3

# Deploy L3 contracts
forge script script/DeployL3Core.s.sol \\
  --rpc-url http://localhost:39545 \\
  --broadcast \\
  --private-key $DEPLOYER_KEY`}</div>
      </div>

      <div className="wp-section" id="services-deploy">
        <div className="wp-h2">3. Services Deployment</div>
        <div className="wp-p">
          Build all services sequentially to avoid OOM errors:
        </div>
        <div className="wp-code">{`# Build services (sequential — NOT parallel, avoids OOM)
npm run build:services

# Or use the dedicated script
./scripts/build-services-sequential.sh

# Deploy with Docker Compose
docker compose -f docker-compose.yml up -d

# Check service health
curl http://localhost:7900/health   # GhostBrain
curl http://localhost:7701/health   # Chain Status
curl http://localhost:7683/health   # Treasury Engine`}</div>
      </div>

      <div className="wp-section" id="testnet">
        <div className="wp-h2">4. Testnet Deployment</div>
        <div className="wp-code">{`# Use testnet compose profile
docker compose -f compose.testnet.yml up -d

# Testnet env vars (set in .env)
GHOSTCHAIN_ENV=testnet
L1_RPC_URL=http://testnet-l1.ghostchain.cloud:18545
L2_RPC_URL=http://testnet-l2.ghostchain.cloud:29545
L3_RPC_URL=http://testnet-l3.ghostchain.cloud:39545`}</div>
      </div>

      <div className="wp-section" id="checks">
        <div className="wp-h2">5. Pre-Release Checks</div>
        <div className="wp-code">{`# All must exit 0 before mainnet deploy

npm run deprecations:check   # no deprecated APIs
npm run gst:leakage          # no non-GST token integrations
npm run gst:symbol           # GST symbol consistency
npm run verify:routing       # routing-law guards intact
npm run brand:full           # 15-layer branding audit
npm run phase2:preflight     # governance contract preflight
npm run test:foundry         # forge tests pass
npm run test:sovereign       # sovereign treasury/federation tests pass`}</div>
      </div>

      <div className="wp-section" id="infra">
        <div className="wp-h2">6. Infrastructure</div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Component</th><th>Location</th><th>Notes</th></tr></thead>
            <tbody>
              {[
                ["Kubernetes",         "infra/kubernetes/",     "Helm charts for all services"],
                ["Terraform",          "infra/terraform/",      "Cloud provisioning (GCE/AWS)"],
                ["Vault",              "infra/vault/",          "HashiCorp Vault integration for secrets"],
                ["Cosmos chain",       "infra/ghostchain/",     "ghostchaind node config + genesis"],
                ["OP Stack",           "infra/opstack/",        "op-geth + op-node config files"],
                ["GAIS Supervisor",    "infra/hypervisor/",     "VM + container auto-restart (port 9100)"],
              ].map(([c, l, n]) => (
                <tr key={c}><td style={{ fontWeight: 600 }}>{c}</td><td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--cyan)" }}>{l}</td><td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="wp-section" id="secrets">
        <div className="wp-h2">7. Secrets Management</div>
        <div className="wp-callout wp-callout-warn">
          Never commit secrets to git. Use HashiCorp Vault or environment variables only.
          The following have no defaults and will cause services to fail-closed if unset:
        </div>
        <ul className="wp-ul">
          <li><code>POSTGRES_PASSWORD</code></li>
          <li><code>COMPLIANCE_JWT_SECRET</code></li>
          <li><code>DEPLOYER_KEY</code> (private key for contract deployment)</li>
          <li><code>GHOSTBRAIN_API_KEY</code></li>
          <li><code>COSMOS_NODE_KEY</code></li>
        </ul>
      </div>
    </div>
  );
}
