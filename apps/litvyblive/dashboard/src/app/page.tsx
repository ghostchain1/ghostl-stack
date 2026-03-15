"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStats, fetchLiveStreams } from "@/lib/api";
import StatCard from "@/components/StatCard";
import { formatGst, timeAgo } from "@/lib/utils";
import { Radio } from "lucide-react";

export default function OverviewPage() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });
  const { data: streams } = useQuery({ queryKey: ["streams"], queryFn: fetchLiveStreams, refetchInterval: 10_000 });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">GhostChain L3 Dashboard</h1>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Users"      value={stats?.totalUsers     ?? "—"} color="text-brand-blue" />
        <StatCard label="Live Streams"     value={stats?.liveStreams     ?? "—"} color="text-brand-pink" />
        <StatCard label="GST Volume (24h)" value={stats ? formatGst(stats.gstVolume24h) : "—"} color="text-brand-gold" />
        <StatCard label="Active Agencies"  value={stats?.activeAgencies ?? "—"} color="text-brand-purple" />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Radio size={18} className="text-brand-pink" /> Live Streams
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-dark-border">
                <th className="text-left py-2 pr-4">Host</th>
                <th className="text-left py-2 pr-4">Title</th>
                <th className="text-left py-2 pr-4">Viewers</th>
                <th className="text-left py-2 pr-4">PK</th>
                <th className="text-left py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {(streams ?? []).map((s) => (
                <tr key={s.id} className="border-b border-dark-border last:border-0 hover:bg-dark-bg">
                  <td className="py-2 pr-4 font-medium">{s.host_name}</td>
                  <td className="py-2 pr-4 text-gray-400 truncate max-w-[180px]">{s.title}</td>
                  <td className="py-2 pr-4">{s.viewer_count.toLocaleString()}</td>
                  <td className="py-2 pr-4">{s.is_pk_active ? <span className="text-brand-pink text-xs font-bold">PK</span> : "—"}</td>
                  <td className="py-2 text-gray-500 text-xs">{timeAgo(s.started_at)}</td>
                </tr>
              ))}
              {!streams?.length && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-600">No live streams</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
