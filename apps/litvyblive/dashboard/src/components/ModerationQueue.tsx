"use client";

import { useState } from "react";
import { AlertTriangle, Flag, MessageSquareX, Gift, X, VolumeX, Ban } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import clsx from "clsx";

// ── Types ────────────────────────────────────────────────────────────────────
export type ReportType = "stream_report" | "ai_flag" | "chat_abuse" | "fake_gift";

export interface ModerationItem {
  id:            string;
  type:          ReportType;
  stream_id?:    string;
  user_id?:      string;
  username?:     string;
  host_name?:    string;
  reason:        string;
  ai_confidence?: number; // 0-1, present for ai_flag
  created_at:    string;
  severity:      "low" | "medium" | "high" | "critical";
}

interface Props {
  items:      ModerationItem[];
  isLoading?: boolean;
}

// ── Severity badge ────────────────────────────────────────────────────────────
const severityClass: Record<ModerationItem["severity"], string> = {
  low:      "bg-gray-700 text-gray-300",
  medium:   "bg-yellow-900 text-yellow-300",
  high:     "bg-orange-900 text-orange-300",
  critical: "bg-red-900 text-red-300",
};

// ── Type icon + label ─────────────────────────────────────────────────────────
function typeLabel(t: ReportType) {
  switch (t) {
    case "stream_report": return { Icon: Flag,            label: "Stream Report" };
    case "ai_flag":       return { Icon: AlertTriangle,   label: "AI Flag" };
    case "chat_abuse":    return { Icon: MessageSquareX,  label: "Chat Abuse" };
    case "fake_gift":     return { Icon: Gift,            label: "Fake Gift" };
  }
}

// ── Action mutations ──────────────────────────────────────────────────────────
function useModAction() {
  const qc = useQueryClient();
  const dismiss = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/moderation/queue/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["modQueue"] }),
  });
  const muteUser = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/users/${userId}/mute`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["modQueue"] }),
  });
  const banUser = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/users/${userId}/ban`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["modQueue"] }),
  });
  const endStream = useMutation({
    mutationFn: (streamId: string) => api.post(`/admin/streams/${streamId}/end`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["modQueue", "streams"] }),
  });
  return { dismiss, muteUser, banUser, endStream };
}

// ── Queue item ────────────────────────────────────────────────────────────────
function QueueItem({ item }: { item: ModerationItem }) {
  const { Icon, label } = typeLabel(item.type);
  const { dismiss, muteUser, banUser, endStream } = useModAction();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={clsx(
        "border rounded-lg p-4 transition-colors cursor-pointer select-none",
        item.severity === "critical"
          ? "border-red-700 bg-red-950/30"
          : "border-dark-border bg-dark-card",
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 shrink-0 text-gray-400" />
        <span className="text-xs font-semibold text-gray-200 flex-1 min-w-0 truncate">
          {label}
          {item.host_name && <span className="text-gray-400 ml-1">— {item.host_name}</span>}
          {item.username   && <span className="text-gray-400 ml-1">— {item.username}</span>}
        </span>

        {item.ai_confidence !== undefined && (
          <span className="text-xs text-yellow-400 font-mono mr-2">
            {Math.round(item.ai_confidence * 100)}% conf
          </span>
        )}

        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", severityClass[item.severity])}>
          {item.severity}
        </span>

        <span className="text-[10px] text-gray-600 ml-2 shrink-0">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pl-7 space-y-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-gray-400">{item.reason}</p>

          <div className="flex flex-wrap gap-2">
            {item.user_id && (
              <>
                <button
                  className="btn-secondary text-xs flex items-center gap-1"
                  onClick={() => muteUser.mutate(item.user_id!)}
                  disabled={muteUser.isPending}
                >
                  <VolumeX className="w-3 h-3" /> Mute User
                </button>
                <button
                  className="btn-danger text-xs flex items-center gap-1"
                  onClick={() => banUser.mutate(item.user_id!)}
                  disabled={banUser.isPending}
                >
                  <Ban className="w-3 h-3" /> Ban Account
                </button>
              </>
            )}
            {item.stream_id && (
              <button
                className="btn-danger text-xs flex items-center gap-1"
                onClick={() => endStream.mutate(item.stream_id!)}
                disabled={endStream.isPending}
              >
                <X className="w-3 h-3" /> End Stream
              </button>
            )}
            <button
              className="btn-secondary text-xs flex items-center gap-1 ml-auto"
              onClick={() => dismiss.mutate(item.id)}
              disabled={dismiss.isPending}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const TYPE_FILTERS: Array<{ value: ReportType | "all"; label: string }> = [
  { value: "all",           label: "All" },
  { value: "stream_report", label: "Reports" },
  { value: "ai_flag",       label: "AI Flags" },
  { value: "chat_abuse",    label: "Chat" },
  { value: "fake_gift",     label: "Fake Gifts" },
];

export default function ModerationQueue({ items, isLoading }: Props) {
  const [typeFilter, setTypeFilter] = useState<ReportType | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | ModerationItem["severity"]>("all");

  if (isLoading) return <div className="py-12 text-center text-gray-600">Loading queue…</div>;

  const filtered = items.filter((it) =>
    (typeFilter === "all"     || it.type     === typeFilter) &&
    (severityFilter === "all" || it.severity === severityFilter),
  );

  const criticalCount = items.filter((it) => it.severity === "critical").length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-400">{items.length} pending</span>
        {criticalCount > 0 && (
          <span className="text-xs font-bold text-red-400 bg-red-950 px-2 py-0.5 rounded-full">
            {criticalCount} CRITICAL
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={clsx("text-xs px-3 py-1 rounded-full border transition-colors",
              typeFilter === value
                ? "border-brand-purple text-brand-purple bg-brand-purple/10"
                : "border-dark-border text-gray-500 hover:text-gray-300")}
            onClick={() => setTypeFilter(value as ReportType | "all")}
          >
            {label}
          </button>
        ))}

        <select
          className="input-sm ml-auto text-xs"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as any)}
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-gray-600 text-sm">Queue is clear.</div>
        )}
        {/* Sort: critical first */}
        {[...filtered]
          .sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.severity] - order[b.severity];
          })
          .map((item) => <QueueItem key={item.id} item={item} />)}
      </div>
    </div>
  );
}
