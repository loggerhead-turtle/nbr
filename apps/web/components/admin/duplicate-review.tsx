"use client";

import { useState, useTransition } from "react";
import { mergeTeamAction, dismissDuplicateAction } from "@/lib/admin-actions";
import type { DupPair, DupTeam, DupGame } from "@/lib/duplicates";

export function DuplicateReview({ initialPairs }: { initialPairs: DupPair[] }) {
  const [pairs, setPairs] = useState(initialPairs);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = (key: string) => setPairs((p) => p.filter((x) => `${x.a.id}|${x.b.id}` !== key));

  const onMerge = (pair: DupPair) => {
    const key = `${pair.a.id}|${pair.b.id}`;
    setBusyId(key);
    const fd = new FormData();
    fd.set("sourceId", pair.b.id); // merge the lesser record…
    fd.set("targetId", pair.a.id); // …into the one we keep
    startTransition(async () => {
      await mergeTeamAction(fd);
      remove(key);
      setBusyId(null);
    });
  };

  const onDismiss = (pair: DupPair) => {
    const key = `${pair.a.id}|${pair.b.id}`;
    setBusyId(key);
    const fd = new FormData();
    fd.set("teamIdA", pair.a.id);
    fd.set("teamIdB", pair.b.id);
    startTransition(async () => {
      await dismissDuplicateAction(fd);
      remove(key);
      setBusyId(null);
    });
  };

  const onPause = (pair: DupPair) => remove(`${pair.a.id}|${pair.b.id}`);

  if (pairs.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl">✅</p>
        <p className="mt-2 text-lg font-semibold text-navy-900">No more possible duplicates</p>
        <p className="mt-1 text-sm text-slate-500">You’re all caught up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">{pairs.length} possible duplicate(s) to review.</p>
      {pairs.map((pair) => {
        const key = `${pair.a.id}|${pair.b.id}`;
        const isBusy = pending && busyId === key;
        return (
          <div key={key} className={`card overflow-hidden ${isBusy ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between bg-navy-900 px-4 py-2 text-sm text-white">
              <span className="font-semibold">{pair.a.name}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                {pair.commonCount > 0
                  ? `${pair.commonCount} shared game${pair.commonCount === 1 ? "" : "s"}`
                  : "no shared games"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2">
              <TeamSide team={pair.a} role="Keep" />
              <TeamSide team={pair.b} role="Merge in" />
            </div>

            <div className="no-print flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <button
                onClick={() => onMerge(pair)}
                disabled={isBusy}
                className="btn-primary disabled:opacity-50"
              >
                ✓ Merge ({pair.b.name} → {pair.a.name})
              </button>
              <button onClick={() => onDismiss(pair)} disabled={isBusy} className="btn-ghost disabled:opacity-50">
                ✗ Not a duplicate
              </button>
              <button onClick={() => onPause(pair)} disabled={isBusy} className="btn-ghost disabled:opacity-50">
                ⏸ Pause
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamSide({ team, role }: { team: DupTeam; role: "Keep" | "Merge in" }) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-center justify-between">
        <span
          className={`badge ${role === "Keep" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
        >
          {role}
        </span>
        <span className="text-2xl font-black tabular-nums text-navy-900">{team.totalGames}</span>
      </div>
      <p className="mt-2 font-semibold text-slate-800">{team.name}</p>
      <p className="text-xs text-slate-500">
        {team.city ?? "no location"}
        {" · "}
        {team.classification ? `Varsity ${team.classification}` : team.ageGroup ?? "unclassified"}
        {" · "}
        {team.gcTeamId ? `GC ${team.gcTeamId}` : team.isGhost ? "unverified" : "no GC id"}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {team.games.slice(0, 8).map((g: DupGame, i) => (
          <li key={i} className="flex justify-between">
            <span className="truncate pr-2">
              {g.date} · {g.opponent}
            </span>
            <span className="tabular-nums">
              {g.us}-{g.them}
            </span>
          </li>
        ))}
        {team.totalGames > 8 && <li className="text-slate-400">+{team.totalGames - 8} more…</li>}
        {team.totalGames === 0 && <li className="text-slate-400">No games.</li>}
      </ul>
    </div>
  );
}
