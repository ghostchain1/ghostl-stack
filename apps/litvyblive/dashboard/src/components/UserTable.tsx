"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { banUser, User } from "@/lib/api";
import { formatGst } from "@/lib/utils";
import { Ban, Eye, ChevronDown, ChevronUp, Search } from "lucide-react";
import clsx from "clsx";

type SortKey = "level" | "followers" | "gst_balance" | "created_at";

interface Props {
  users:       User[];
  total:       number;
  page:        number;
  onPage:      (p: number) => void;
  isLoading?:  boolean;
}

export default function UserTable({ users, total, page, onPage, isLoading }: Props) {
  const qc = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery]     = useState("");

  const { mutate: doBan } = useMutation({
    mutationFn: banUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const toggle = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : null;

  const visible = users
    .filter((u) =>
      !query ||
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      u.email?.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? diff : -diff;
    });

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-sm pl-8 w-full"
            placeholder="Search user or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="text-xs text-gray-500">{total.toLocaleString()} users total</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-dark-border text-left">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("level")}>
                <span className="flex items-center gap-1">Level <SortIcon k="level" /></span>
              </th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("followers")}>
                <span className="flex items-center gap-1">Followers <SortIcon k="followers" /></span>
              </th>
              <th className="py-2 pr-4 cursor-pointer select-none hover:text-white" onClick={() => toggle("gst_balance")}>
                <span className="flex items-center gap-1">GST Balance <SortIcon k="gst_balance" /></span>
              </th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Agency</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-600">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-600">No users found.</td></tr>
            ) : (
              visible.map((u) => (
                <tr key={u.id} className="border-b border-dark-border last:border-0 hover:bg-dark-bg transition">
                  <td className="py-2 pr-4 font-medium">{u.username}</td>
                  <td className="py-2 pr-4 text-xs text-gray-400">{u.email ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className="text-brand-gold font-semibold">Lv {u.level}</span>
                  </td>
                  <td className="py-2 pr-4">{u.followers.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-brand-gold">{formatGst(u.gst_balance)}</td>
                  <td className="py-2 pr-4">
                    {u.is_host ? (
                      <span className="text-xs bg-brand-purple/20 text-brand-purple px-1.5 py-0.5 rounded">Host</span>
                    ) : (
                      <span className="text-xs text-gray-500">Viewer</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{u.agency_id ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button title="View profile" className="p-1 rounded hover:bg-dark-border text-gray-400">
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => doBan(u.id)}
                        title="Ban user"
                        className="p-1 rounded hover:bg-red-900/40 text-red-400"
                      >
                        <Ban size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-secondary text-xs disabled:opacity-40">
              Previous
            </button>
            <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="btn-secondary text-xs disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
