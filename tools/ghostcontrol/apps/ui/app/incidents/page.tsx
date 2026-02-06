function apiBaseUrl(): string {
  return (
    process.env.GHOSTCONTROL_API_URL ??
    process.env.NEXT_PUBLIC_GHOSTCONTROL_API ??
    "http://localhost:7401"
  );
}

async function getIncidents() {
  const url = `${apiBaseUrl().replace(/\\/+$/, "")}/incidents`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as Array<any>;
}

function severityClass(sev: string): string {
  if (sev === "critical" || sev === "error") return "bad";
  if (sev === "warn") return "warn";
  return "good";
}

export default async function IncidentsPage() {
  const incidents = await getIncidents();

  return (
    <div className="card">
      <h2>Incidents</h2>
      <p className="muted">Latest 100 incidents from the audit DB.</p>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Severity</th>
            <th>Source</th>
            <th>Message</th>
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td className="muted">{i.createdAt}</td>
              <td>
                <span className={`badge ${severityClass(i.severity)}`}>
                  {i.severity}
                </span>
              </td>
              <td>
                <code>{i.source}</code>
              </td>
              <td>{i.message}</td>
              <td>
                <code>{i.signature}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

