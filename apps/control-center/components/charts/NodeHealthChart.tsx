"use client";
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  cpuPct:  number;
  memPct:  number;
  diskPct: number;
  label?:  string;
}

export function NodeHealthChart({ cpuPct, memPct, diskPct, label }: Props) {
  const data = [
    { name: "CPU",  value: cpuPct,  fill: "#7c3aed" },
    { name: "Mem",  value: memPct,  fill: "#10b981" },
    { name: "Disk", value: diskPct, fill: "#f59e0b" },
  ];
  return (
    <div className="node-health-chart">
      {label && <div className="chart-label">{label}</div>}
      <ResponsiveContainer width="100%" height={110}>
        <RadialBarChart
          cx="50%" cy="50%"
          innerRadius="30%" outerRadius="90%"
          data={data}
          startAngle={90} endAngle={-270}
        >
          <RadialBar dataKey="value" cornerRadius={3} />
          <Tooltip
            contentStyle={{ background: "#0f1117", border: "1px solid #1c2030", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number, name: string) => [`${v}%`, name]}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span style={{ color: "#7c3aed" }}>CPU {cpuPct}%</span>
        <span style={{ color: "#10b981" }}>Mem {memPct}%</span>
        <span style={{ color: "#f59e0b" }}>Disk {diskPct}%</span>
      </div>
    </div>
  );
}
