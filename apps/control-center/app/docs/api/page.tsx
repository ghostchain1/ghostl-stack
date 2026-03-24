export default function ApiReferencePage() {
  const sections = [
    {
      title: "Chain Status",
      base: "http://localhost:7701",
      endpoints: [
        { method: "GET", path: "/health",           desc: "Service health check" },
        { method: "GET", path: "/status",           desc: "All chain status (L1/L2/L3 block heights, latency)" },
        { method: "GET", path: "/chains/:chainId",  desc: "Single chain metadata (RPC, chainId, blockHeight)" },
      ],
    },
    {
      title: "Bridge Service",
      base: "http://localhost:7702",
      endpoints: [
        { method: "GET",  path: "/health",           desc: "Service health" },
        { method: "GET",  path: "/status",           desc: "Active bridge contracts + TVL" },
        { method: "POST", path: "/bridge",           desc: "Initiate cross-chain transfer (routing-law enforced)" },
        { method: "GET",  path: "/transactions",     desc: "Recent bridge transactions" },
      ],
    },
    {
      title: "Contract Registry",
      base: "http://localhost:7703",
      endpoints: [
        { method: "GET", path: "/health",            desc: "Service health" },
        { method: "GET", path: "/registry",          desc: "All registered contracts (layer, address, abi)" },
        { method: "GET", path: "/registry/:address", desc: "Single contract metadata" },
      ],
    },
    {
      title: "GNS API",
      base: "http://localhost:7704",
      endpoints: [
        { method: "GET",  path: "/health",           desc: "Service health" },
        { method: "GET",  path: "/names",            desc: "All registered .ghost names" },
        { method: "GET",  path: "/resolve/:name",    desc: "Resolve name → address" },
        { method: "POST", path: "/register",         desc: "Register a .ghost name (GST payment required)" },
      ],
    },
    {
      title: "GhostBrain Core",
      base: "http://localhost:7900",
      endpoints: [
        { method: "GET",  path: "/health",           desc: "GhostBrain health + AI engine status" },
        { method: "GET",  path: "/metrics",          desc: "AI signal metrics (Prometheus format)" },
        { method: "POST", path: "/classify",         desc: "Transaction classification" },
        { method: "POST", path: "/risk",             desc: "Risk score for a transaction or address" },
        { method: "GET",  path: "/proposals",        desc: "Draft AI governance proposals (pending ratification)" },
      ],
    },
    {
      title: "Treasury Engine",
      base: "http://localhost:7683",
      endpoints: [
        { method: "GET", path: "/health",            desc: "Service health" },
        { method: "GET", path: "/summary",           desc: "Treasury balance, revenue, allocations" },
        { method: "GET", path: "/revenue/streams",   desc: "Revenue breakdown by source (DeFi/gas/GNS/SaaS)" },
      ],
    },
    {
      title: "Compliance API",
      base: "http://localhost:8090",
      endpoints: [
        { method: "GET",  path: "/health",           desc: "Service health" },
        { method: "GET",  path: "/status",           desc: "Compliance posture summary" },
        { method: "POST", path: "/check/address",    desc: "KYC/AML check for an address" },
        { method: "GET",  path: "/alerts",           desc: "Active compliance alerts" },
      ],
    },
  ];

  return (
    <div className="wp-body">
      <div className="wp-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="wp-title" style={{ fontSize: "1.8rem" }}>API Reference</div>
        <div className="wp-subtitle" style={{ fontSize: "0.95rem" }}>
          REST endpoints for all GhostStack microservices
        </div>
      </div>

      <div className="wp-callout" style={{ marginBottom: "1.5rem" }}>
        All services return JSON. Authentication tokens (where required) are passed via
        <code>Authorization: Bearer &lt;token&gt;</code>. Token endpoint: <code>POST http://localhost:7705/auth/token</code>
      </div>

      {sections.map((sec) => (
        <div className="wp-section" key={sec.title} id={sec.title.toLowerCase().replace(/\s+/g, "-")}>
          <div className="wp-h2">{sec.title}</div>
          <div style={{ marginBottom: "0.5rem", fontFamily: "monospace", color: "var(--text-muted)", fontSize: "0.82rem" }}>
            Base URL: <span style={{ color: "var(--cyan)" }}>{sec.base}</span>
          </div>
          <div className="wp-table-wrap">
            <table className="wp-table">
              <thead>
                <tr><th>Method</th><th>Path</th><th>Description</th></tr>
              </thead>
              <tbody>
                {sec.endpoints.map((ep) => (
                  <tr key={ep.path}>
                    <td>
                      <span style={{
                        fontSize: "0.72rem", fontWeight: 700, fontFamily: "monospace",
                        color: ep.method === "GET" ? "var(--green)" : ep.method === "POST" ? "var(--amber)" : "var(--text)",
                      }}>{ep.method}</span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "var(--cyan)" }}>{ep.path}</td>
                    <td style={{ fontSize: "0.85rem" }}>{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="wp-section" id="rpc">
        <div className="wp-h2">Chain RPC Endpoints</div>
        <div className="wp-callout wp-callout-warn">
          RPC namespace is <code>ghost_</code> — never <code>eth_</code>.
          Use <code>ghost_blockNumber</code>, <code>ghost_getBalance</code>, etc.
        </div>
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Layer</th><th>Chain ID</th><th>RPC URL</th></tr></thead>
            <tbody>
              {[
                ["L1 GhostChain", "14000101", "http://localhost:18545"],
                ["L2 GhostL2",    "901",       "http://localhost:29545"],
                ["L3 GhostL3",    "903",       "http://localhost:39545"],
              ].map(([l, c, r]) => (
                <tr key={c}><td>{l}</td><td style={{ fontFamily: "monospace", color: "var(--amber)" }}>{c}</td><td style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.82rem" }}>{r}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wp-code">{`# Example: get block number on L1
curl -X POST http://localhost:18545 \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}'`}</div>
      </div>
    </div>
  );
}
