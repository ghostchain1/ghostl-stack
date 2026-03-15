"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRevenueHistory } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatGst } from "@/lib/utils";

export default function RevenuePage() {
  const { data: history } = useQuery({ queryKey: ["revenue"], queryFn: fetchRevenueHistory });

  const total = (history ?? []).reduce((sum, d) => sum + d.gst, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Revenue — GST</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase mb-1">Total GST Revenue</p>
          <p className="text-3xl font-bold text-brand-gold">{formatGst(total * 1e18)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase mb-1">Chain</p>
          <p className="text-3xl font-bold text-brand-blue">GhostL3 — 903</p>
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-gray-400 mb-4">GST Volume (30 Days)</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={history ?? []}>
            <defs>
              <linearGradient id="gst" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7B2FBE" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#7B2FBE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#13131E", border: "1px solid #1E1E2E", borderRadius: 8 }}
              formatter={(v: number) => [v.toLocaleString() + " GST", "Volume"]}
            />
            <Area type="monotone" dataKey="gst" stroke="#7B2FBE" fill="url(#gst)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
