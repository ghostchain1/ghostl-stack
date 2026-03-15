"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  approveAgency, freezeAgency, updateAgencyCommission, Agency,
} from "@/lib/api";
import { formatGst } from "@/lib/utils";
import { CheckCircle, Lock, Edit2, Check, X, Users, TrendingUp } from "lucide-react";
import clsx from "clsx";

interface Props {
  agencies:   Agency[];
  isLoading?: boolean;
}

function AgencyRow({ agency }: { agency: Agency }) {
  const qc = useQueryClient();
  const [editComm, setEditComm] = useState(false);
  const [commRate, setCommRate] = useState(agency.commission_rate.toString());

  const { mutate: doApprove } = useMutation({
    mutationFn: approveAgency,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agencies"] }),
  });
  const { mutate: doFreeze } = useMutation({
    mutationFn: freezeAgency,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agencies"] }),
  });
  const { mutate: doComm } = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) => updateAgencyCommission(id, rate),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agencies"] }); setEditComm(false); },
  });

  const status: string = (agency as any).status ?? "active";

  return (
    <div className={clsx("card", status === "frozen" && "opacity-60 border-red-900/40")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4 flex-1">
          {/* Logo placeholder */}
          <div className="w-10 h-10 rounded-lg bg-dark-border flex items-center justify-center text-lg shrink-0">
            {(agency.name ?? "?").charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{agency.name}</p>
              {status === "frozen" && (
                <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded">Frozen</span>
              )}
              {status === "pending" && (
                <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded">Pending Approval</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><Users size={11} /> Hosts</p>
                <p className="font-medium">{agency.hosts_count.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp size={11} /> Monthly Rev</p>
                <p className="font-medium text-brand-gold">{formatGst(agency.monthly_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ranking</p>
                <p className="font-medium">#{agency.ranking}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Commission</p>
                {editComm ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      className="input-sm w-16 text-xs"
                      type="number" min={0} max={100} step={0.5}
                      value={commRate}
                      onChange={(e) => setCommRate(e.target.value)}
                    />
                    <span className="text-xs text-gray-500">%</span>
                    <button onClick={() => doComm({ id: agency.id, rate: Number(commRate) })} className="p-0.5 text-green-400">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditComm(false)} className="p-0.5 text-gray-400">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="font-medium flex items-center gap-1">
                    {agency.commission_rate}%
                    <button onClick={() => setEditComm(true)} className="text-gray-500 hover:text-white">
                      <Edit2 size={11} />
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {status === "pending" && (
            <button
              onClick={() => doApprove(agency.id)}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <CheckCircle size={12} /> Approve
            </button>
          )}
          <button
            onClick={() => doFreeze(agency.id)}
            className={clsx(
              "btn-secondary text-xs flex items-center gap-1",
              status === "frozen" ? "text-green-400" : "text-red-400",
            )}
          >
            <Lock size={12} />
            {status === "frozen" ? "Unfreeze" : "Freeze"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgencyPanel({ agencies, isLoading }: Props) {
  const [filter, setFilter] = useState("");

  const visible = (agencies ?? []).filter(
    (a) => !filter || a.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          className="input-sm max-w-xs"
          placeholder="Search agency…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="text-xs text-gray-500">{visible.length} agencies</span>
      </div>

      {isLoading && <p className="text-gray-500">Loading agencies…</p>}

      <div className="grid gap-3">
        {visible.map((a) => (
          <AgencyRow key={a.id} agency={a} />
        ))}
        {!isLoading && !visible.length && (
          <p className="text-center py-12 text-gray-600">No agencies found.</p>
        )}
      </div>
    </div>
  );
}
