"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRankings } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AnalyticsPage() {
  const { data: creators } = useQuery({ queryKey: ["rank", "creators"], queryFn: () => fetchRankings("creators") });
  const { data: gifts    } = useQuery({ queryKey: ["rank", "gifts"],    queryFn: () => fetchRankings("gifts")    });

  const topCreators = (creators ?? []).slice(0, 10).map((c) => ({ name: c.username, score: c.score }));
  const topGivers   = (gifts    ?? []).slice(0, 10).map((g) => ({ name: g.username, score: g.score }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="card">
        <p className="text-sm text-gray-400 mb-4">Top 10 Creators by Score</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={topCreators}>
            <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#13131E", border: "1px solid #1E1E2E", borderRadius: 8 }} />
            <Bar dataKey="score" fill="#7B2FBE" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <p className="text-sm text-gray-400 mb-4">Top 10 Gift Senders (GST)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={topGivers}>
            <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#13131E", border: "1px solid #1E1E2E", borderRadius: 8 }} />
            <Bar dataKey="score" fill="#FF2D78" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
