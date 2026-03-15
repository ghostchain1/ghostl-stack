"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLiveStreams } from "@/lib/api";
import { ShieldAlert } from "lucide-react";

// In production wire this to a dedicated moderation/reports endpoint.
// For now surfaces the live streams + PK battles for manual review.
export default function ModerationPage() {
  const { data: streams } = useQuery({ queryKey: ["streams"], queryFn: fetchLiveStreams, refetchInterval: 10_000 });

  const flagged = (streams ?? []).filter((s) => s.viewer_count > 10_000 || s.is_pk_active);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShieldAlert className="text-brand-pink" size={22} /> Moderation Queue
      </h1>

      <p className="text-sm text-gray-500">
        High-traffic streams ({">"} 10k viewers) and active PK battles are surfaced automatically.
      </p>

      <div className="grid gap-3">
        {flagged.map((s) => (
          <div key={s.id} className="card border-brand-pink/30">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{s.host_name}</p>
                <p className="text-sm text-gray-400">{s.title} · {s.viewer_count.toLocaleString()} viewers</p>
              </div>
              <div className="flex gap-2">
                {!!s.is_pk_active && <span className="bg-brand-pink/20 text-brand-pink text-xs px-2 py-1 rounded">PK</span>}
                {s.viewer_count > 10_000 && <span className="bg-yellow-900/30 text-yellow-400 text-xs px-2 py-1 rounded">Trending</span>}
              </div>
            </div>
          </div>
        ))}
        {!flagged.length && <p className="text-gray-600 py-12 text-center">No flagged content right now.</p>}
      </div>
    </div>
  );
}
