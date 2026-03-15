"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLiveStreams, endStream, Stream } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Square } from "lucide-react";

export default function StreamsPage() {
  const qc = useQueryClient();
  const { data: streams, isLoading } = useQuery({
    queryKey: ["streams"],
    queryFn: fetchLiveStreams,
    refetchInterval: 8_000,
  });

  const { mutate: stopStream } = useMutation({
    mutationFn: endStream,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streams"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Live Streams Monitor</h1>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="grid gap-3">
        {(streams ?? []).map((s: Stream) => (
          <div key={s.id} className="card flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{s.host_name}</p>
              <p className="text-sm text-gray-400">{s.title} · {s.category}</p>
              <p className="text-xs text-gray-600 mt-1">
                {s.viewer_count.toLocaleString()} viewers · {timeAgo(s.started_at)}
                {!!s.is_pk_active && <span className="ml-2 text-brand-pink font-bold">PK ACTIVE</span>}
                {!!s.is_avatar_mode && <span className="ml-2 text-brand-blue">Avatar</span>}
              </p>
            </div>
            <button
              onClick={() => stopStream(s.id)}
              className="btn-danger flex items-center gap-1 text-xs"
            >
              <Square size={12} /> End
            </button>
          </div>
        ))}
        {!isLoading && !streams?.length && (
          <p className="text-gray-600 py-12 text-center">No live streams right now.</p>
        )}
      </div>
    </div>
  );
}
