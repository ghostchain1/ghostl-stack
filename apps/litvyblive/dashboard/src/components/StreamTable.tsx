"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { endStream, Stream } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Square, Flag, Star, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";

type SortKey = "viewer_count" | "started_at" | "host_name";

interface Props {
  streams: Stream[];
  isLoading?: boolean;
}

export default function StreamTable({ streams, isLoading }: Props) {
  const qc = useQueryClient();
  const [sortKey, setSortKey]     = useState<SortKey>("viewer_count");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [filter, setFilter]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const { mutate: stopStream } = useMutation({
    mutationFn: endStream,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streams"] }),
  });

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : null;

  const filtered = streams
    .filter((s) =>
      !filter ||
      s.host_name.toLowerCase().includes(filter.toLowerCase()) ||
      s.title.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === "number"
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <input
          className="input-sm flex-1 max-w-xs"
          placeholder="Filter by host or title…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {selected.size > 0 && (
          <button
            onClick={() => { selected.forEach((id) => stopStream(id)); setSelected(new Set()); }}
            className="btn-danger text-xs"
          >
            End {selected.size} selected
          </button>
        )}
        <span className="text-xs text-gray-500">{filtered.length} stream{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-dark-border text-left">
              <th className="py-2 pr-2 w-8">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((s) => s.id)) : new Set())}
                />
              </th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("host_name")}>
                <span className="flex items-center gap-1">Host <SortIcon k="host_name" /></span>
              </th>
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("viewers")}>
                <span className="flex items-center gap-1">Viewers <SortIcon k="viewers" /></span>
              </th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("started_at")}>
                <span className="flex items-center gap-1">Started <SortIcon k="started_at" /></span>
              </th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-600">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-600">No streams found.</td></tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className={clsx(
                    "border-b border-dark-border last:border-0 hover:bg-dark-bg transition",
                    selected.has(s.id) && "bg-brand-purple/10",
                  )}
                >
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                  </td>
                  <td className="py-2 pr-4 font-medium whitespace-nowrap">{s.host_name}</td>
                  <td className="py-2 pr-4 text-gray-400 max-w-[200px] truncate">{s.title}</td>
                  <td className="py-2 pr-4">{s.viewer_count.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-gray-500">{s.category}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-1 flex-wrap">
                      <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">LIVE</span>
                      {!!s.is_pk_active && <span className="text-xs bg-brand-pink/20 text-brand-pink px-1.5 py-0.5 rounded">PK</span>}
                      {!!s.is_avatar_mode && <span className="text-xs bg-brand-blue/20 text-brand-blue px-1.5 py-0.5 rounded">Avatar</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{timeAgo(s.started_at)}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button onClick={() => stopStream(s.id)} title="End stream" className="p-1 rounded hover:bg-red-900/40 text-red-400">
                        <Square size={13} />
                      </button>
                      <button title="Flag stream" className="p-1 rounded hover:bg-yellow-900/40 text-yellow-400">
                        <Flag size={13} />
                      </button>
                      <button title="Promote stream" className="p-1 rounded hover:bg-yellow-900/40 text-yellow-400">
                        <Star size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
