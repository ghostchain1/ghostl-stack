"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  fetchInfrastructure, restartNode, scaleNode, InfraNode,
} from "@/lib/api";
import { Server, Cpu, Database, Wifi, RefreshCw, ChevronUp } from "lucide-react";
import clsx from "clsx";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy:  "bg-green-900/40 text-green-400",
    warning:  "bg-yellow-900/40 text-yellow-400",
    critical: "bg-red-900/40 text-red-400",
    degraded: "bg-orange-900/40 text-orange-400",
    unknown:  "bg-gray-800 text-gray-400",
  };
  return (
    <span className={clsx("text-xs px-2 py-0.5 rounded font-medium capitalize", colors[status] ?? colors.unknown)}>
      {status}
    </span>
  );
}

function NodeCard({ node, onRestart, onScale }: {
  node: InfraNode;
  onRestart: (id: string) => void;
  onScale: (id: string, delta: number) => void;
}) {
  const cpuPct  = Math.round(node.cpu_pct ?? 0);
  const memPct  = Math.round(node.mem_pct ?? 0);
  const barCpu  = clsx("h-1.5 rounded transition-all", cpuPct > 80 ? "bg-red-500" : cpuPct > 60 ? "bg-yellow-500" : "bg-green-500");
  const barMem  = clsx("h-1.5 rounded transition-all", memPct > 80 ? "bg-red-500" : memPct > 60 ? "bg-yellow-500" : "bg-blue-500");

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{node.name}</p>
          <p className="text-xs text-gray-500">{node.type} · {node.region}</p>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* CPU bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>CPU</span><span>{cpuPct}%</span>
        </div>
        <div className="w-full bg-dark-border rounded h-1.5">
          <div className={barCpu} style={{ width: `${cpuPct}%` }} />
        </div>
      </div>

      {/* Memory bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Memory</span><span>{memPct}%</span>
        </div>
        <div className="w-full bg-dark-border rounded h-1.5">
          <div className={barMem} style={{ width: `${memPct}%` }} />
        </div>
      </div>

      <div className="text-xs text-gray-600">
        Uptime: {node.uptime ?? "—"} · Connections: {node.connections ?? "—"}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onRestart(node.id)}
          className="btn-secondary text-xs flex items-center gap-1"
        >
          <RefreshCw size={11} /> Restart
        </button>
        {node.type === "streaming" && (
          <button
            onClick={() => onScale(node.id, 1)}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            <ChevronUp size={11} /> Scale
          </button>
        )}
      </div>
    </div>
  );
}

export default function InfrastructurePage() {
  const { data: nodes, isLoading, refetch } = useQuery({
    queryKey: ["infrastructure"],
    queryFn: fetchInfrastructure,
    refetchInterval: 15_000,
  });

  const { mutate: doRestart } = useMutation({ mutationFn: restartNode, onSuccess: () => refetch() });
  const { mutate: doScale }   = useMutation({ mutationFn: ({ id, delta }: { id: string; delta: number }) => scaleNode(id, delta) });

  const byType = (type: string) => (nodes ?? []).filter((n) => n.type === type);
  const summary = (nodes ?? []).reduce(
    (acc, n) => {
      acc[n.status] = (acc[n.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Infrastructure Monitor</h1>
        <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-1">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(summary).map(([status, count]) => (
          <div key={status} className="card px-4 py-2 flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-sm font-semibold">{count}</span>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-gray-500">Loading nodes…</p>}

      {/* API Nodes */}
      {byType("api").length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Server size={16} className="text-brand-blue" /> API Nodes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {byType("api").map((n) => (
              <NodeCard key={n.id} node={n}
                onRestart={(id) => doRestart(id)}
                onScale={(id, delta) => doScale({ id, delta })} />
            ))}
          </div>
        </section>
      )}

      {/* Streaming Nodes */}
      {byType("streaming").length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Wifi size={16} className="text-brand-pink" /> Streaming Nodes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {byType("streaming").map((n) => (
              <NodeCard key={n.id} node={n}
                onRestart={(id) => doRestart(id)}
                onScale={(id, delta) => doScale({ id, delta })} />
            ))}
          </div>
        </section>
      )}

      {/* Database / Redis */}
      {byType("database").length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Database size={16} className="text-brand-gold" /> Databases & Redis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {byType("database").map((n) => (
              <NodeCard key={n.id} node={n}
                onRestart={(id) => doRestart(id)}
                onScale={(id, delta) => doScale({ id, delta })} />
            ))}
          </div>
        </section>
      )}

      {/* Fallback: show all */}
      {!isLoading && !nodes?.length && (
        <div className="text-center py-16 text-gray-600">
          <Cpu size={40} className="mx-auto mb-4 opacity-30" />
          <p>No infrastructure nodes returned.</p>
          <p className="text-sm mt-1">
            Wire <code className="text-xs">/api/admin/infrastructure</code> to return node health data.
          </p>
        </div>
      )}
    </div>
  );
}
