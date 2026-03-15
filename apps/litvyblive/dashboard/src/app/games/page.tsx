"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchGames, updateGame, GameConfig,
} from "@/lib/api";
import { formatGst } from "@/lib/utils";
import { Gamepad2, ToggleLeft, ToggleRight, Edit2, Check, X } from "lucide-react";
import clsx from "clsx";

function GameRow({ game, onSave }: { game: GameConfig; onSave: (g: GameConfig) => void }) {
  const [editing, setEditing] = useState(false);
  const [entryCost, setEntryCost]   = useState(game.entry_cost_gst.toString());
  const [maxReward, setMaxReward]   = useState(game.max_reward_gst.toString());
  const [enabled, setEnabled]       = useState(game.enabled);

  const save = () => {
    onSave({ ...game, entry_cost_gst: Number(entryCost), max_reward_gst: Number(maxReward), enabled });
    setEditing(false);
  };

  return (
    <div className={clsx("card", !enabled && "opacity-50")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold">{game.name}</p>
            <span className={clsx("text-xs px-2 py-0.5 rounded",
              enabled ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"
            )}>
              {enabled ? "Active" : "Disabled"}
            </span>
          </div>
          <p className="text-xs text-gray-500">{game.description}</p>

          {editing ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Entry Cost (GST)</span>
                <input
                  className="input-sm w-full"
                  type="number" min={0}
                  value={entryCost}
                  onChange={(e) => setEntryCost(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Max Reward (GST)</span>
                <input
                  className="input-sm w-full"
                  type="number" min={0}
                  value={maxReward}
                  onChange={(e) => setMaxReward(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm col-span-2">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Enabled
              </label>
            </div>
          ) : (
            <div className="mt-3 flex gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500">Entry Cost</p>
                <p className="font-medium">{formatGst(game.entry_cost_gst)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Max Reward</p>
                <p className="font-medium">{formatGst(game.max_reward_gst)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Daily Players</p>
                <p className="font-medium">{game.daily_players?.toLocaleString() ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">GST Paid Out</p>
                <p className="font-medium">{game.total_payout_gst ? formatGst(game.total_payout_gst) : "—"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          {editing ? (
            <>
              <button onClick={save} className="btn-primary text-xs p-1.5" title="Save">
                <Check size={14} />
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-xs p-1.5" title="Cancel">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="btn-secondary text-xs p-1.5" title="Edit">
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onSave({ ...game, enabled: !game.enabled })}
                className="btn-secondary text-xs p-1.5"
                title={enabled ? "Disable" : "Enable"}
              >
                {enabled ? <ToggleRight size={14} className="text-green-400" /> : <ToggleLeft size={14} />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GamesPage() {
  const qc = useQueryClient();
  const { data: games, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: fetchGames,
  });

  const { mutate: save } = useMutation({
    mutationFn: updateGame,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["games"] }),
  });

  const totalPayout = (games ?? []).reduce((a, g) => a + (g.total_payout_gst ?? 0), 0);
  const activeCnt   = (games ?? []).filter((g) => g.enabled).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Gamepad2 size={22} className="text-brand-purple" /> Games Control Panel
      </h1>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-purple">{activeCnt}</p>
          <p className="text-xs text-gray-500 mt-1">Active Games</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-gold">{formatGst(totalPayout)}</p>
          <p className="text-xs text-gray-500 mt-1">Total GST Paid Out</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-blue">
            {(games ?? []).reduce((a, g) => a + (g.daily_players ?? 0), 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Daily Players</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-400">{(games ?? []).length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Games</p>
        </div>
      </div>

      {isLoading && <p className="text-gray-500">Loading games…</p>}

      <div className="grid gap-3">
        {(games ?? []).map((g) => (
          <GameRow key={g.id} game={g} onSave={save} />
        ))}
        {!isLoading && !games?.length && (
          <div className="text-center py-16 text-gray-600">
            <Gamepad2 size={40} className="mx-auto mb-4 opacity-30" />
            <p>No games configured.</p>
            <p className="text-sm mt-1">Wire <code className="text-xs">/api/games/config</code> to return game settings.</p>
          </div>
        )}
      </div>
    </div>
  );
}
