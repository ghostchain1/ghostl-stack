function apiBaseUrl(): string {
  return (
    process.env.GHOSTCONTROL_API_URL ??
    process.env.NEXT_PUBLIC_GHOSTCONTROL_API ??
    "http://localhost:7401"
  );
}

async function getStatus() {
  const url = `${apiBaseUrl().replace(/\\/+$/, "")}/status`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return (await res.json()) as any;
}

export default async function Page() {
  const status = await getStatus();

  return (
    <div className="grid">
      <div className="card">
        <h2>GhostControl Status</h2>
        <p className="muted">
          Control plane snapshot. Use Incidents/Actions to drive heal loops.
        </p>
        <pre style={{ margin: 0, overflowX: "auto" }}>
          <code>{JSON.stringify(status, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
}

