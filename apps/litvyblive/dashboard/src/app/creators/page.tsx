"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRankings, RankEntry } from "@/lib/api";
import { Star } from "lucide-react";

export default function CreatorsPage() {
  const { data: creators } = useQuery({ queryKey: ["ranking", "creators"], queryFn: () => fetchRankings("creators") });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Star className="text-brand-gold" size={22} /> Top Creators
      </h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-dark-border">
              <th className="text-left py-2 pr-4 w-12">Rank</th>
              <th className="text-left py-2 pr-4">Creator</th>
              <th className="text-left py-2 pr-4">Level</th>
              <th className="text-left py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {(creators ?? []).map((c: RankEntry) => (
              <tr key={c.userId} className="border-b border-dark-border last:border-0 hover:bg-dark-bg">
                <td className="py-2 pr-4">
                  <span className={`text-xs font-bold ${c.rank <= 3 ? "text-brand-gold" : "text-gray-500"}`}>
                    #{c.rank}
                  </span>
                </td>
                <td className="py-2 pr-4 font-medium">{c.username}</td>
                <td className="py-2 pr-4">{c.level}</td>
                <td className="py-2">{c.score.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
