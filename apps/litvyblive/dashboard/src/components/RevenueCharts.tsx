"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area,
} from "recharts";
import { formatGst } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
export interface RevenueDay {
  date:              string;
  gift_volume_gst:   number;
  creator_payouts:   number;
  agency_commission: number;
  platform_fee:      number;
}

interface Props {
  data:       RevenueDay[];
  isLoading?: boolean;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function GstTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.name}</span>
          <span className="font-semibold">{formatGst(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RevenueCharts({ data, isLoading }: Props) {
  if (isLoading) return <div className="py-12 text-center text-gray-600">Loading revenue data…</div>;
  if (!data?.length) return <div className="py-12 text-center text-gray-600">No revenue data available.</div>;

  const totals = data.reduce(
    (acc, d) => ({
      gift_volume_gst:   acc.gift_volume_gst   + d.gift_volume_gst,
      creator_payouts:   acc.creator_payouts   + d.creator_payouts,
      agency_commission: acc.agency_commission + d.agency_commission,
      platform_fee:      acc.platform_fee      + d.platform_fee,
    }),
    { gift_volume_gst: 0, creator_payouts: 0, agency_commission: 0, platform_fee: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Gift Volume",        value: totals.gift_volume_gst,   color: "text-brand-gold" },
          { label: "Creator Payouts",    value: totals.creator_payouts,   color: "text-brand-blue" },
          { label: "Agency Commission",  value: totals.agency_commission, color: "text-brand-purple" },
          { label: "Platform Revenue",   value: totals.platform_fee,      color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className={`text-xl font-bold ${color}`}>{formatGst(value)}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Gift volume over time */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">GST Gift Volume</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="giftGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f5c518" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f5c518" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<GstTooltip />} />
            <Area type="monotone" dataKey="gift_volume_gst" name="Gift Volume" stroke="#f5c518" fill="url(#giftGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue split stacked bar */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">Revenue Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<GstTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="creator_payouts"   name="Creator Payouts"   stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="agency_commission" name="Agency Commission" stackId="a" fill="#a855f7" />
            <Bar dataKey="platform_fee"      name="Platform Fee"      stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart: creator payouts vs agency commission */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">Payouts Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<GstTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="creator_payouts"   name="Creator Payouts"   stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="agency_commission" name="Agency Commission" stroke="#a855f7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
