"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgencyList, Agency } from "@/lib/api";
import Link from "next/link";
import { Building2 } from "lucide-react";

export default function AgenciesPage() {
  const { data: agencies } = useQuery({ queryKey: ["agencies"], queryFn: fetchAgencyList });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Building2 className="text-brand-purple" size={22} /> Agencies
      </h1>

      <div className="grid gap-3">
        {(agencies ?? []).map((a: Agency, i: number) => (
          <Link key={a.id} href={`/agencies/${a.id}`} className="card flex items-center justify-between hover:border-brand-purple/50 transition cursor-pointer">
            <div>
              <p className="font-semibold">{a.name}</p>
              <p className="text-xs text-gray-500">
                Rank #{i + 1} · {a.hosts_count} hosts · {(a.commission_rate * 100).toFixed(0)}% commission
              </p>
            </div>
            <span className="text-brand-purple text-sm">View →</span>
          </Link>
        ))}
        {!agencies?.length && <p className="text-gray-600 py-12 text-center">No agencies found.</p>}
      </div>
    </div>
  );
}
