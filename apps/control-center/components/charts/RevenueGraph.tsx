"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface RevenueDataPoint {
  label:   string;
  defi:    number;
  trading: number;
  saas:    number;
  compute: number;
}

interface Props {
  data:    RevenueDataPoint[];
  height?: number;
}

const usd = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `$${(v / 1_000).toFixed(0)}K`
  : `$${v.toFixed(0)}`;

export function RevenueGraph({ data, height = 240 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {[
            { id: "gDefi",    color: "#7c3aed" },
            { id: "gTrading", color: "#10b981" },
            { id: "gSaaS",    color: "#f59e0b" },
            { id: "gCompute", color: "#06b6d4" },
          ].map(({ id, color }) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#1c2030" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={usd} width={52} />
        <Tooltip
          contentStyle={{ background: "#0f1117", border: "1px solid #1c2030", borderRadius: 6, fontSize: 12 }}
          formatter={(v: number, name: string) => [usd(v), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="defi"    name="DeFi"    stroke="#7c3aed" fill="url(#gDefi)"    strokeWidth={2} />
        <Area type="monotone" dataKey="trading" name="Trading" stroke="#10b981" fill="url(#gTrading)" strokeWidth={2} />
        <Area type="monotone" dataKey="saas"    name="SaaS"    stroke="#f59e0b" fill="url(#gSaaS)"    strokeWidth={2} />
        <Area type="monotone" dataKey="compute" name="Compute" stroke="#06b6d4" fill="url(#gCompute)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
