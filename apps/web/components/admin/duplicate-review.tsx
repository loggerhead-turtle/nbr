"use client";

import { useState, useTransition } from "react";
import { mergeTeamAction, dismissDuplicateAction } from "@/lib/admin-actions";
import type { DupPair, DupTeam, DupGame } from "@/lib/duplicates";
import type { MergeTier } from "@nbr/core";

const TIER_STYLE: Record<MergeTier, { bar: string; chip: string; label: string }> = {
  high: { bar: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800", label: "High confidence" },
  medium: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", label: "Medium confidence" },
  low: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", label: "Low confidence" },
  none: { bar: "bg-slate-400", chip: "bg-slate-200 text-slate-700", label: "Not a match" },
};

function gcUrl(gcTeamId: string): string {
  return `https://web.gc.com/teams/${gcTeamId}/schedule`;
}

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
        const conf = pair.confidence;
        const style = TIER_STYLE[conf.tier];
        return (
          <div key={key} className={`card overflow-hidden ${isBusy ? "opacity-50" : ""}`}>
            {/* Heat-map bar — width + colour encode merge confidence. */}
            <div className="h-1.5 w-full bg-slate-100">
              <div className={`h-full ${style.bar}`} style={{ width: `${conf.score}%` }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
              <span className="font-semibold">{pair.a.name}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
                  {style.label} · {conf.score}%
                </span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                  {pair.commonGames.length > 0
                    ? `${pair.commonGames.length} shared game${pair.commonGames.length === 1 ? "" : "s"}`
                    : "no shared games"}
                </span>
              </span>
            </div>

            {(conf.reasons.length > 0 || conf.blockers.length > 0) && (
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2">
                {conf.reasons.map((r, i) => (
                  <span
                    key={`r${i}`}
                    className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700"
                  >
                    ✓ {r}
                  </span>
                ))}
                {conf.blockers.map((b, i) => (
                  <span key={`b${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">
                    ✗ {b}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2">
              <TeamSide team={pair.a} role="Keep" />
              <TeamSide team={pair.b} role="Merge in" />
            </div>

            {pair.commonGames.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Shared games (same opponent &amp; date)
                </p>
                <ul className="space-y-1 text-sm">
                  {pair.commonGames.slice(0, 8).map((g, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600">
                        {g.date} · vs {g.opponent}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="font-medium text-navy-800">
                          {g.aUs}-{g.aThem}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="font-medium text-navy-800">
                          {g.bUs}-{g.bThem}
                        </span>
                        <span title={g.scoresMatch ? "scores match" : "scores differ"}>
                          {g.scoresMatch ? "✅" : "⚠️"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
        {team.city ? `${team.city}${team.state ? `, ${team.state}` : ""}` : "no location"}
        {" · "}
        {team.classification ? `Varsity ${team.classification}` : team.ageGroup ?? "unclassified"}
        {" · "}
        {team.gcTeamId ? (
          <a
            href={gcUrl(team.gcTeamId)}
            target="_blank"
            rel="noreferrer"
            className="text-sky-600 underline hover:text-sky-800"
          >
            GameChanger ↗
          </a>
        ) : team.isGhost ? (
          "unverified"
        ) : (
          "no GC id"
        )}
      </p>
      {team.coaches.length > 0 && (
        <p className="mt-1 truncate text-xs text-slate-400" title={team.coaches.join(", ")}>
          Staff: {team.coaches.join(", ")}
        </p>
      )}
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
