export default function AlertsLogsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Alerts & Logs</h1>
      <p className="mt-2 text-sm text-gray-400">Live health and anomaly visibility for economic services.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-medium text-gray-300">Configured Alert Classes</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-300">
          <li>Routing violation / bypass attempt</li>
          <li>Treasury execution reject spike</li>
          <li>Proof snapshot inactivity</li>
          <li>Service liveness and latency degradation</li>
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">
        Prometheus metrics endpoint: <code>/metrics</code> on each <code>hg-*</code> service.
        <br />
        Alert rules: <code>observability/prometheus/rules/econ-engine.rules.yml</code>
      </section>
    </main>
  );
}
