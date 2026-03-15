"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, banUser, User } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { useState } from "react";

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users", page],
    queryFn: () => fetchUsers(page, 50),
  });

  const { mutate: doBan } = useMutation({
    mutationFn: banUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-dark-border">
              <th className="text-left py-2 pr-4">Username</th>
              <th className="text-left py-2 pr-4">Level</th>
              <th className="text-left py-2 pr-4">Followers</th>
              <th className="text-left py-2 pr-4">Talent</th>
              <th className="text-left py-2 pr-4">Host</th>
              <th className="text-left py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u: User) => (
              <tr key={u.id} className="border-b border-dark-border last:border-0 hover:bg-dark-bg">
                <td className="py-2 pr-4 font-medium">{u.username}</td>
                <td className="py-2 pr-4">{u.level}</td>
                <td className="py-2 pr-4">{u.followers.toLocaleString()}</td>
                <td className="py-2 pr-4">{(u.talent_score * 100).toFixed(0)}%</td>
                <td className="py-2 pr-4">{u.is_host ? <span className="text-brand-pink text-xs font-bold">HOST</span> : "—"}</td>
                <td className="py-2">
                  <button onClick={() => doBan(u.id)} className="btn-danger text-xs">Ban</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-primary disabled:opacity-40">Prev</button>
        <span className="text-gray-400 self-center">Page {page}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={!data?.users.length} className="btn-primary disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
