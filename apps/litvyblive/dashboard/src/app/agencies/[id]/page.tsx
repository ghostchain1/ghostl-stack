"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgency } from "@/lib/api";
import { use } from "react";

export default function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: agency, isLoading } = useQuery({ queryKey: ["agency", id], queryFn: () => fetchAgency(id) });

  if (isLoading) return <p className="text-gray-500">Loading agency…</p>;
  if (!agency)   return <p className="text-gray-500">Agency not found.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{agency.name}</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Hosts</p>
          <p className="text-2xl font-bold text-brand-blue">{agency.hosts_count}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Monthly Revenue (GST)</p>
          <p className="text-2xl font-bold text-brand-gold">{agency.monthly_revenue.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Ranking</p>
          <p className="text-2xl font-bold">#{agency.ranking}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Commission Rate</p>
          <p className="text-2xl font-bold">{(agency.commission_rate * 100).toFixed(0)}%</p>
        </div>
      </div>
    </div>
  );
}
