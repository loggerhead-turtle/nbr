"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { repairBadMergesAction } from "@/lib/admin-actions";

export interface OutlierVM {
  gameId: string;
  opponentName: string;
  opponentAge: number;
  gap: number;
  date: string;
}

export interface FindingVM {
  teamId: string;
  teamName: string;
  teamAge: number;
  ownCohortGames: number;
  outliers: OutlierVM[];
}

const GAP_OPTIONS = [2, 3, 4, 5];

export function BadMergeReview({ findings, gap }: { findings: FindingVM[]; gap: number }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const live = findings.filter((f) => !done.has(f.teamId));
  const totalGames = live.reduce((n, f) => n + f.outliers.length, 0);

  const repair = (teamId: string, label: string) => {
    if (!window.confirm(`${label}\n\nThis moves the off-age game(s) onto a regenerated ghost and triggers a recompute. Continue?`)) {
      return;
    }
    setBusy(teamId || "ALL");
    const fd = new FormData();
    if (teamId) fd.set("teamId", teamId);
    fd.set("gap", String(gap));
    startTransition(async () => {
      await repairBadMergesAction(fd);
      if (teamId) {
        setDone((prev) => new Set(prev).add(teamId));
      } else {
        setDone(new Set(findings.map((f) => f.teamId)));
      }
      setBusy(null);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {live.length} polluted team(s), {totalGames} off-age game(s) at gap ≥ {gap}.
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Threshold:</span>
          {GAP_OPTIONS.map((g) => (
            <Link
              key={g}
              href={`/admin/bad-merges?gap=${g}`}
              className={`rounded-md px-2 py-1 ${
                g === gap ? "bg-navy-900 text-white" : "bg-slate-100 text-navy-800 hover:bg-slate-200"
              }`}
            >
              {g}+
            </Link>
          ))}
        </div>
      </div>

      {live.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-2 text-lg font-semibold text-navy-900">No cross-age merges at this threshold</p>
          <p className="mt-1 text-sm text-slate-500">Try a lower threshold to catch closer mismatches.</p>
        </div>
      ) : (
        <>
          <button
            onClick={() => repair("", `Repair ALL ${live.length} team(s)`)}
            disabled={pending}
            className="btn-primary disabled:opacity-50"
          >
            {busy === "ALL" ? "Repairing…" : `✓ Repair all ${live.length} team(s)`}
          </button>

          {live.map((f) => {
            const isBusy = pending && busy === f.teamId;
            return (
              <div key={f.teamId} className={`card overflow-hidden ${isBusy ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
                  <span className="font-semibold">
                    {f.teamName} <span className="text-white/60">(U{f.teamAge})</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-white/15 px-2 py-0.5">
                      {f.ownCohortGames} own-cohort
                    </span>
                    <span className="rounded-full bg-rose-500/80 px-2 py-0.5">
                      {f.outliers.length} off-age
                    </span>
                  </span>
                </div>

                <ul className="divide-y divide-slate-100 text-sm">
                  {f.outliers.map((o) => (
                    <li key={o.gameId} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span className="truncate text-slate-600">
                        {o.date} · vs {o.opponentName}
                      </span>
                      <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">
                        U{o.opponentAge} · gap {o.gap}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <button
                    onClick={() => repair(f.teamId, `Repair “${f.teamName}” (${f.outliers.length} game(s))`)}
                    disabled={isBusy}
                    className="btn-primary disabled:opacity-50"
                  >
                    {isBusy ? "Repairing…" : `✓ Repair this team`}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
