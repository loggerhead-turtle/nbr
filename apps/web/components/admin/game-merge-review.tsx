"use client";

import { useState, useTransition } from "react";
import { resolveGameMergeAction } from "@/lib/admin-actions";
import { NbrLink, GcLink } from "./team-links";
import type { GameMergeCandidateView } from "@nbr/db";

export function GameMergeReview({ items }: { items: GameMergeCandidateView[] }) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const live = items.filter((it) => !handled.has(it.id));

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl">✅</p>
        <p className="mt-2 text-lg font-semibold text-navy-900">Nothing to review</p>
        <p className="mt-1 text-sm text-slate-500">
          No same-day matchup currently has a disputed game count. Conflicts appear here when two
          teams&rsquo; schedules disagree on how many times they played each other on a day.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {live.length} conflict{live.length === 1 ? "" : "s"} awaiting review.
      </p>
      {live.map((it) => (
        <GameMergeCard key={it.id} item={it} onHandled={() => setHandled((p) => new Set(p).add(it.id))} />
      ))}
    </div>
  );
}

function GameMergeCard({
  item,
  onHandled,
}: {
  item: GameMergeCandidateView;
  onHandled: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const resolve = (resolution: "doubleheader" | "single" | "dismiss") =>
    startTransition(async () => {
      setError(null);
      try {
        const fd = new FormData();
        fd.set("candidateId", item.id);
        fd.set("resolution", resolution);
        await resolveGameMergeAction(fd);
        onHandled();
      } catch {
        setError("Couldn't save — try again.");
      }
    });

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-navy-900">
          {item.a.name} <span className="text-slate-400">vs</span> {item.b.name}
        </h3>
        <span className="text-sm font-medium text-slate-500">{item.day}</span>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        The two schedules disagree on how many games were played that day:{" "}
        <strong>
          {item.a.name} lists {item.a.count}
        </strong>
        , <strong>
          {item.b.name} lists {item.b.count}
        </strong>
        . That&rsquo;s usually either a real doubleheader that one side didn&rsquo;t record fully, or
        a single game one side entered twice. Open both GameChanger pages to check, then choose.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {[item.a, item.b].map((side) => (
          <div key={side.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-navy-800">
                {side.name}
                {side.isGhost && (
                  <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                    ghost
                  </span>
                )}
              </span>
              <span className="text-sm font-bold text-navy-900">
                {side.count} game{side.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <NbrLink slug={side.slug} />
              <GcLink gcTeamId={side.gcTeamId} />
            </div>
          </div>
        ))}
      </div>

      {item.games.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Currently stored ({item.games.length} row{item.games.length === 1 ? "" : "s"})
          </p>
          <ul className="space-y-1 text-sm text-slate-700">
            {item.games.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span className="tabular-nums">
                  {item.a.name} {g.aScore ?? "–"}
                  <span className="text-slate-400"> – </span>
                  {g.bScore ?? "–"} {item.b.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => resolve("doubleheader")}
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Real doubleheader — keep both
        </button>
        <button
          onClick={() => resolve("single")}
          disabled={pending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          One game entered twice — keep one
        </button>
        <button
          onClick={() => resolve("dismiss")}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        After keeping both or keeping one, run Recompute ratings — the game graph changed.
      </p>
    </div>
  );
}
