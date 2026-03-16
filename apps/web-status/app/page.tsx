"use client";
import { GHOST_SITES } from "@ghostchain/config";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";
import { useEffect, useState } from "react";

type ServiceStatus = "operational" | "degraded" | "outage" | "loading";

interface ServiceState {
  name: string;
  status: ServiceStatus;
  latency?: number;
  uptime?: string;
}

const SERVICES_INITIAL: ServiceState[] = [
  { name: "L1 RPC", status: "loading" },
  { name: "L2 RPC", status: "loading" },
  { name: "L3 RPC", status: "loading" },
  { name: "GhostScan", status: "loading" },
  { name: "Bridge", status: "loading" },
  { name: GHOST_SITES.governance.domain, status: "loading" },
  { name: GHOST_SITES.apps.domain, status: "loading" },
  { name: GHOST_SITES.portal.domain, status: "loading" },
];

const statusDisplay: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  operational: { label: "Operational", color: "#10B981", bg: "#10B98122" },
  degraded: { label: "Degraded", color: "#F59E0B", bg: "#F59E0B22" },
  outage: { label: "Outage", color: "#EF4444", bg: "#EF444422" },
  loading: { label: "Checking…", color: "#64748b", bg: "#64748b22" },
};

function useServiceStatuses() {
  const [services, setServices] = useState<ServiceState[]>(SERVICES_INITIAL);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/services", { cache: "no-store" });
        if (!res.ok) throw new Error(`status_http_${res.status}`);
        const data = (await res.json()) as { services?: ServiceState[]; checkedAt?: string };
        if (!cancelled && Array.isArray(data.services)) {
          setServices(data.services);
          setUpdatedAt(data.checkedAt || null);
        }
      } catch {
        if (!cancelled) setServices(SERVICES_INITIAL);
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return { services, updatedAt };
}

export default function StatusPage() {
  const { services, updatedAt } = useServiceStatuses();
  const allOk = services.every((s) => s.status === "operational");

  return (
    <>
      <PublicNavbar cta={{ label: "View Explorer", href: GHOST_SITES.explorer.url }} />
      <main>
        {/* Banner */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Network Status</span>
            <div style={{ marginTop: 32, marginBottom: 16 }}>
              {allOk ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "#10B98122", border: "1px solid #10B98144", borderRadius: 12, padding: "16px 32px" }}>
                  <span style={{ color: "#10B981", fontSize: "1.5rem" }}>✓</span>
                  <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#10B981" }}>All systems operational</span>
                </div>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "#F59E0B22", border: "1px solid #F59E0B44", borderRadius: 12, padding: "16px 32px" }}>
                  <span style={{ color: "#F59E0B", fontSize: "1.5rem" }}>⟳</span>
                  <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "#F59E0B" }}>Checking status…</span>
                </div>
              )}
            </div>
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
              Auto-refreshes every 30 seconds{updatedAt ? ` · checked ${new Date(updatedAt).toLocaleTimeString()}` : ""}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
              <a href="/incidents" className="btn-secondary">Incidents</a>
              <a href="/history" className="btn-secondary">History</a>
              <a href="/maintenance" className="btn-secondary">Maintenance</a>
            </div>
          </div>
        </section>

        {/* Service list */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container" style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {services.map((svc) => {
                const d = statusDisplay[svc.status];
                return (
                  <div key={svc.name} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>{svc.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {svc.latency != null && <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{svc.latency}ms</span>}
                      {svc.uptime && <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{svc.uptime}</span>}
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: d.color, background: d.bg, padding: "3px 12px", borderRadius: 20 }}>{d.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Incident history stub */}
        <section style={{ padding: "60px 24px", background: "#0A0A0A", textAlign: "center" }}>
          <div className="container" style={{ maxWidth: 600 }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>Incident History</h2>
            <p style={{ color: "#64748b" }}>No incidents in the last 90 days.</p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
