import Link from "next/link";

const items = [
  { href: "/econ/treasury", label: "Treasury" },
  { href: "/econ/governance", label: "Governance" },
  { href: "/econ/risk", label: "Risk" },
  { href: "/econ/flows", label: "Flows" },
  { href: "/econ/proofs", label: "Proofs" },
  { href: "/econ/alerts-logs", label: "Alerts/Logs" }
];

export default function EconHomePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">GhostStack Economic Engine</h1>
      <p className="mt-3 text-sm text-gray-400">Closed-loop sovereign economy dashboard.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-xl border border-white/10 bg-black/30 p-5 hover:bg-black/40">
            <h2 className="text-lg font-medium">{item.label}</h2>
            <p className="mt-2 text-xs text-gray-400">Open {item.label} view</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
