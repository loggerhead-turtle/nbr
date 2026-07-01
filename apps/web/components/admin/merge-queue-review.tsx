"use client";

import { useState, useTransition } from "react";
import {
  mergeGhostAction,
  dismissGhostMergeAction,
  recomputeRatingsAction,
} from "@/lib/admin-actions";
import { NbrLink, GcLink } from "./team-links";
import type { GhostMergeQueueItem } from "@nbr/db";
import type { MergeTier } from "@nbr/core";

const TIER_STYLE: Record<MergeTier, { bar: string; chip: string; label: string }> = {
  high: { bar: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800", label: "High confidence" },
  medium: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", label: "Medium confidence" },
  low: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", label: "Low" },
  none: { bar: "bg-slate-400", chip: "bg-slate-200 text-slate-700", label: "No match" },
};

export function MergeQueueReview({ items }: { items: GhostMergeQueueItem[] }) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [recomputing, startRecompute] = useTransition();
  const onHandled = (key: string) => setHandled((prev) => new Set(prev).add(key));

  const live = items.filter((it) => !handled.has(it.dismissKey));
  const anyApproved = [...handled].some((k) => items.some((it) => it.dismissKey === k));

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl">✅</p>
        <p className="mt-2 text-lg font-semibold text-navy-900">Nothing to review</p>
        <p className="mt-1 text-sm text-slate-500">
          No added team currently has a confident ghost match waiting. New matches appear here as
          teams are added and scraped.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {live.length} match{live.length === 1 ? "" : "es"} awaiting review.
        </p>
        {anyApproved && (
          <button
            onClick={() => startRecompute(async () => {
              await recomputeRatingsAction();
            })}
            disabled={recomputing}
            className="btn-ghost disabled:opacity-50"
          >
            {recomputing ? "Recomputing…" : "Recompute ratings"}
          </button>
        )}
      </div>

      {live.map((it) => (
        <MergeCard key={it.dismissKey} item={it} onHandled={onHandled} />
      ))}
      {live.length === 0 && (
        <p className="text-sm text-slate-400">
          All matches handled. Run a recompute so the folded games update ratings. 🎉
        </p>
      )}
    </div>
  );
}

function MergeCard({
  item,
  onHandled,
}: {
  item: GhostMergeQueueItem;
  onHandled: (key: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { ghost, target, score, sharedGames } = item;
  const style = TIER_STYLE[score.tier];

  const approve = () => {
    const fd = new FormData();
    fd.set("ghostId", ghost.id);
    fd.set("targetId", target.id);
    startTransition(async () => {
      await mergeGhostAction(fd);
      onHandled(item.dismissKey);
    });
  };

  const dismiss = () => {
    const fd = new FormData();
    fd.set("dismissKey", item.dismissKey);
    startTransition(async () => {
      await dismissGhostMergeAction(fd);
      onHandled(item.dismissKey);
    });
  };

  return (
    <div className={`card overflow-hidden ${pending ? "opacity-50" : ""}`}>
      {/* Header: the added (real) team — the one that is KEPT. */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {target.name}
          {target.isNew && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
              NEW
            </span>
          )}
          <NbrLink slug={target.slug} />
          <GcLink gcTeamId={target.gcTeamId} />
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {target.city ? `${target.city}${target.state ? `, ${target.state}` : ""}` : "no location"}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            added {target.createdAt.slice(0, 10)}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {target.totalGames} game{target.totalGames === 1 ? "" : "s"}
          </span>
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 h-1.5 w-full rounded bg-slate-100">
          <div className={`h-full rounded ${style.bar}`} style={{ width: `${score.score}%` }} />
        </div>

        <p className="text-sm text-slate-600">
          Looks like the same club as ghost{" "}
          <span className="font-semibold text-slate-800">{ghost.name}</span>{" "}
          <NbrLink slug={ghost.slug} />{" "}
          <span className="text-slate-400">
            ({ghost.ageGroup ?? "no age"} · {ghost.totalGames} game
            {ghost.totalGames === 1 ? "" : "s"})
          </span>
          .
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Approving folds the ghost&rsquo;s {ghost.totalGames} game
          {ghost.totalGames === 1 ? "" : "s"} into <strong>{target.name}</strong> and deletes the
          ghost.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
            {style.label} · {score.score}%
          </span>
        </div>

        {(score.reasons.length > 0 || score.blockers.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {score.reasons.map((r, i) => (
              <span
                key={`r${i}`}
                className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700"
              >
                ✓ {r}
              </span>
            ))}
            {score.blockers.map((b, i) => (
              <span key={`b${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">
                ✗ {b}
              </span>
            ))}
          </div>
        )}

        {/* The evidence: matchups the two teams both played (same opponent + day). */}
        {sharedGames.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Date · Opponent</th>
                  <th className="px-2 py-1 text-right font-semibold">Ghost</th>
                  <th className="px-2 py-1 text-right font-semibold">{target.name}</th>
                  <th className="px-1 py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sharedGames.slice(0, 8).map((g, i) => (
                  <tr key={i} className={g.scoresMatch ? "" : "bg-amber-50"}>
                    <td className="px-2 py-1 text-slate-600">
                      {g.date} · vs {g.opponent}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {g.aUs}-{g.aThem}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {g.bUs}-{g.bThem}
                    </td>
                    <td
                      className="px-1 py-1 text-center"
                      title={g.scoresMatch ? "scores match" : "scores differ"}
                    >
                      {g.scoresMatch ? "✅" : "⚠️"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sharedGames.length > 8 && (
              <p className="px-2 py-1 text-[10px] text-slate-400">
                +{sharedGames.length - 8} more shared game(s)
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            No games in common — this match rests on name/location only. Verify on GameChanger before
            approving.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
        <button onClick={approve} disabled={pending} className="btn-primary disabled:opacity-50">
          ✓ Approve merge
        </button>
        <button
          onClick={dismiss}
          disabled={pending}
          className="btn-ghost disabled:opacity-50"
          title="Not the same team — stop suggesting this pair"
        >
          Dismiss (not a match)
        </button>
      </div>
    </div>
  );
}
