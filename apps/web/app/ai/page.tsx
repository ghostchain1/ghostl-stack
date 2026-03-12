import { fetchAIStatus } from "../../lib/api";

export const dynamic = "force-dynamic";

const AI_SERVICES = [
  { name: "ghostbrain-swarm",          port: 9000, role: "Inter-agent event bus" },
  { name: "ghostbrain-economic",        port: 9050, role: "Economic modeling" },
  { name: "ghostbrain-digital-twin",    port: 9100, role: "Infrastructure digital twin" },
  { name: "ghostbrain-conscious-core",  port: 9150, role: "Meta-reasoning layer" },
  { name: "ghostbrain-simulation-lab",  port: 9200, role: "Policy simulation engine" },
  { name: "ghostbrain-evolution-engine",port: 9250, role: "Autonomous self-evolution" },
  { name: "ghostbrain-kernel",          port: 9300, role: "Hypervisor + infra control" },
  { name: "ghostbrain-multichain",      port: 9350, role: "Cross-chain AI operations" },
  { name: "ghost-devops-ai",            port: 9400, role: "CI/CD + build automation" },
  { name: "ghostbrain-control-plane",   port: 9500, role: "Sovereign Control Plane (SCP)" },
  { name: "ghostbrain-interchain",      port: 9450, role: "Bridge + IBC AI" },
  { name: "ghostbrain-governance",      port: 9550, role: "On-chain governance AI" },
  { name: "ghostbrain-research-ai",     port: 9600, role: "Autonomous research" },
  { name: "ghostbrain-validator-fabric",port: 9700, role: "Validator fleet management" },
  { name: "ghostbrain-economy-engine",  port: 9800, role: "Tokenomics AI (AEE)" },
  { name: "ghostbrain-data-mesh",       port: 9900, role: "Global Data Mesh (GDM)" },
];

export default async function AIPage() {
  const live = await fetchAIStatus();
  const liveMap = new Map((live ?? []).map(s => [s.name, s]));

  const reachable = (live ?? []).filter(s => s.reachable).length;
  const total     = AI_SERVICES.length;

  return (
    <>
      <div className="page-header">
        <h1>AI System Health</h1>
        <p>{reachable}/{total} services online</p>
      </div>

      <div className="card">
        <table className="service-table">
          <thead>
            <tr>
              <th>Service</th><th>Port</th><th>Role</th><th>Status</th><th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {AI_SERVICES.map(svc => {
              const live = liveMap.get(svc.name);
              const up   = live?.reachable ?? false;
              return (
                <tr key={svc.name}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{svc.name}</td>
                  <td style={{ color: "var(--text-muted)" }}>{svc.port}</td>
                  <td style={{ color: "var(--text-muted)" }}>{svc.role}</td>
                  <td>
                    {up
                      ? <span className="badge badge-green"><span className="dot"/>Online</span>
                      : <span className="badge badge-red"><span className="dot"/>Offline</span>}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {live?.reachable ? `${live.latencyMs}ms` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
