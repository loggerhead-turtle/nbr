"use client";

import { useState, useTransition } from "react";
import {
  mergeTeamAction,
  dismissDuplicateAction,
  deleteTeamAction,
  snoozeDuplicateAction,
} from "@/lib/admin-actions";
import type { DupPair, DupTeam } from "@/lib/duplicates";
import type { MergeTier } from "@nbr/core";

const TIER_STYLE: Record<MergeTier, { bar: string; chip: string; label: string }> = {
  high: { bar: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800", label: "High confidence" },
  medium: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", label: "Medium confidence" },
  low: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", label: "Low confidence" },
  none: { bar: "bg-slate-400", chip: "bg-slate-200 text-slate-700", label: "Not a match" },
};

const REC_STYLE: Record<DupPair["recommendation"]["kind"], { box: string; label: string }> = {
  "delete-safe": { box: "border-emerald-100 bg-emerald-50", label: "Safe to delete the duplicate" },
  merge: { box: "border-sky-100 bg-sky-50", label: "Merge to combine" },
  review: { box: "border-amber-100 bg-amber-50", label: "Needs a look" },
  "different-age": { box: "border-rose-200 bg-rose-50", label: "Not a duplicate — different ages" },
};

function gcUrl(gcTeamId: string): string {
  return `https://web.gc.com/teams/${gcTeamId}/schedule`;
}

/** Link to the team's own page on this site — to inspect its opponents here. */
function NbrLink({ slug }: { slug: string }) {
  return (
    <a
      href={`/teams/${slug}`}
      target="_blank"
      rel="noreferrer"
      title="Open this team's NBR page"
      className="inline-flex items-center gap-1 rounded-md bg-navy-700 px-2 py-0.5 text-xs font-bold text-white hover:bg-navy-600"
    >
      NBR ↗
    </a>
  );
}

/** Prominent GameChanger link, or a muted tag for ghosts that have no GC page. */
function GcButton({ team }: { team: DupTeam }) {
  if (!team.gcTeamId)
    return (
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
        no GC page
      </span>
    );
  return (
    <a
      href={gcUrl(team.gcTeamId)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${team.name} on GameChanger to double-check`}
      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-sky-700"
    >
      GC ↗
    </a>
  );
}

/**
 * Where a team's games originated. We don't store this per row, so infer it:
 * a team with its own GameChanger id was scraped from its own page (self-
 * reported), while a ghost only exists because opponents listed it — its games
 * are all opponent-reported. This is the "which side reported it" hint.
 */
function provenance(team: DupTeam): string {
  return team.gcTeamId
    ? "self-reported (own GameChanger schedule)"
    : "built from opponents' schedules (ghost)";
}

export function DuplicateReview({ initialPairs }: { initialPairs: DupPair[] }) {
  const [pairs, setPairs] = useState(initialPairs);
  const remove = (key: string) => setPairs((p) => p.filter((x) => `${x.a.id}|${x.b.id}` !== key));

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
      {pairs.map((pair) => (
        <DupCard key={`${pair.a.id}|${pair.b.id}`} pair={pair} onResolved={remove} />
      ))}
    </div>
  );
}

function DupCard({ pair, onResolved }: { pair: DupPair; onResolved: (key: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const key = `${pair.a.id}|${pair.b.id}`;
  const conf = pair.confidence;
  const style = TIER_STYLE[conf.tier];
  const rec = pair.recommendation;
  const disq = conf.disqualified; // different stated ages — can't be the same team
  const isBusy = pending || busy;

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    startTransition(async () => {
      await fn();
      onResolved(key);
      setBusy(false);
    });
  };

  const onMerge = () => {
    const fd = new FormData();
    fd.set("sourceId", pair.b.id); // the lesser record folds…
    fd.set("targetId", pair.a.id); // …into the one we keep
    run(() => mergeTeamAction(fd));
  };

  const onDelete = (deleteId: string) => {
    const target = deleteId === pair.b.id ? pair.b : pair.a;
    const keep = deleteId === pair.b.id ? pair.a : pair.b;
    if (
      !window.confirm(
        `Delete “${target.name}” and its ${target.totalGames} game(s)?\n\n` +
          `Its games already exist on “${keep.name}”, so nothing is lost. This cannot be undone.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("teamId", deleteId);
    run(() => deleteTeamAction(fd));
  };

  const onDismiss = () => {
    const fd = new FormData();
    fd.set("teamIdA", pair.a.id);
    fd.set("teamIdB", pair.b.id);
    run(() => dismissDuplicateAction(fd));
  };

  const onSnooze = () => {
    const fd = new FormData();
    fd.set("teamIdA", pair.a.id);
    fd.set("teamIdB", pair.b.id);
    fd.set("days", "1");
    run(() => snoozeDuplicateAction(fd));
  };

  return (
    <div className={`card overflow-hidden ${isBusy ? "opacity-50" : ""}`}>
      {/* Heat-map bar — width + colour encode merge confidence. */}
      <div className="h-1.5 w-full bg-slate-100">
        <div className={`h-full ${style.bar}`} style={{ width: `${conf.score}%` }} />
      </div>

      {/* Header: both names with one-click GameChanger links + confidence. */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{pair.a.name}</span>
          <NbrLink slug={pair.a.slug} />
          <GcButton team={pair.a} />
          <span className="text-white/40">vs</span>
          <span className="font-semibold">{pair.b.name}</span>
          <NbrLink slug={pair.b.slug} />
          <GcButton team={pair.b} />
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
          {disq ? "Not a match" : `${style.label} · ${conf.score}%`}
        </span>
      </div>

      {/* Plain-English recommendation + game-overlap counts. */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm ${REC_STYLE[rec.kind].box}`}
      >
        <span className="font-semibold">{REC_STYLE[rec.kind].label}</span>
        {pair.mergeConfidence != null && (
          <span
            title="How cleanly the duplicate's games line up with the kept team"
            className="rounded-full bg-navy-900 px-2 py-0.5 text-xs font-bold text-white"
          >
            {pair.mergeConfidence}% merge conf.
          </span>
        )}
        <span className="text-slate-600">{rec.note}</span>
        <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
            {pair.overlap.exact} exact
          </span>
          {pair.overlap.close - pair.overlap.exact > 0 && (
            <span className="rounded bg-lime-100 px-1.5 py-0.5 font-medium text-lime-800">
              {pair.overlap.close - pair.overlap.exact} ~close
            </span>
          )}
          {pair.overlap.diffScore > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
              {pair.overlap.diffScore} differ
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {pair.overlap.uniqueA} only on “{pair.a.name}”
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {pair.overlap.uniqueB} only on “{pair.b.name}”
          </span>
        </span>
      </div>

      {(conf.reasons.length > 0 || conf.blockers.length > 0) && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2">
          {conf.reasons.map((r, i) => (
            <span key={`r${i}`} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
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

      {/* The evidence, pinned and side-by-side: the games that line up. */}
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Games that line up ({pair.commonGames.length}) — same opponent &amp; date
        </p>
        {pair.commonGames.length === 0 ? (
          <p className="text-sm text-slate-400">
            No identical matchups — this pair was flagged by name/region only. Open both GameChanger
            pages above to compare.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">Date · Opponent</th>
                  <th className="px-3 py-1.5 text-right font-semibold">{pair.a.name}</th>
                  <th className="px-3 py-1.5 text-right font-semibold">{pair.b.name}</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pair.commonGames.map((g, i) => (
                  <tr key={i} className={g.scoresClose ? "" : "bg-amber-50"}>
                    <td className="px-3 py-1.5 text-slate-600">
                      {g.date} · vs {g.opponent}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-navy-800">
                      {g.aUs}-{g.aThem}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-navy-800">
                      {g.bUs}-{g.bThem}
                    </td>
                    <td
                      className="px-2 py-1.5 text-center"
                      title={
                        g.scoresMatch
                          ? "scores match"
                          : g.scoresClose
                            ? "scores within a couple runs — treated as the same game"
                            : "scores differ"
                      }
                    >
                      {g.scoresMatch ? "✅" : g.scoresClose ? "≈" : "⚠️"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          Each column shows that row’s own recorded score. “{pair.a.name}” is {provenance(pair.a)};
          “{pair.b.name}” is {provenance(pair.b)}. ✅ = identical, ≈ = within a couple runs (treated
          as the same game — scoring typo), ⚠️ = scores differ more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2">
        <TeamSide team={pair.a} role="Keep" />
        <TeamSide team={pair.b} role="Merge in" />
      </div>

      <div className="no-print flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
        {disq ? (
          // Different ages — merging is always wrong; send them to the fix instead.
          <a
            href="/admin/bad-merges?gap=1"
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            🛠 Fix on Bad merges →
          </a>
        ) : (
          <>
            <button onClick={onMerge} disabled={isBusy} className="btn-primary disabled:opacity-50">
              ✓ Merge ({pair.b.name} → {pair.a.name})
            </button>
            {rec.kind === "delete-safe" && (
              <button
                onClick={() => onDelete(rec.deleteId)}
                disabled={isBusy}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                🗑 Delete duplicate ({pair.b.name})
              </button>
            )}
          </>
        )}
        <button onClick={onDismiss} disabled={isBusy} className="btn-ghost disabled:opacity-50">
          ✗ Not a duplicate
        </button>
        <button
          onClick={onSnooze}
          disabled={isBusy}
          title="Hide for a day so re-scrapes can add more games, then resurface it"
          className="btn-ghost disabled:opacity-50"
        >
          ⏰ Revisit later
        </button>
      </div>
    </div>
  );
}

function TeamSide({ team, role }: { team: DupTeam; role: "Keep" | "Merge in" }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? team.games : team.games.slice(0, 8);
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
      <p className="mt-2 flex flex-wrap items-center gap-2 font-semibold text-slate-800">
        {team.name}
        <NbrLink slug={team.slug} />
        <GcButton team={team} />
      </p>
      <p className="text-xs text-slate-500">
        {team.city ? `${team.city}${team.state ? `, ${team.state}` : ""}` : "no location"}
        {" · "}
        {team.classification ? `Varsity ${team.classification}` : team.ageGroup ?? "unclassified"}
      </p>
      <p className="mt-0.5 text-xs italic text-slate-400">{provenance(team)}</p>
      {team.coaches.length > 0 && (
        <p className="mt-1 truncate text-xs text-slate-400" title={team.coaches.join(", ")}>
          Staff: {team.coaches.join(", ")}
        </p>
      )}
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {shown.map((g, i) => (
          <li key={i} className="flex justify-between">
            <span className="truncate pr-2">
              {g.date} · {g.opponent}
            </span>
            <span className="tabular-nums">
              {g.us}-{g.them}
            </span>
          </li>
        ))}
        {team.totalGames === 0 && <li className="text-slate-400">No games.</li>}
      </ul>
      {team.totalGames > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-800"
        >
          {showAll ? "Show fewer" : `Show all ${team.totalGames} games`}
        </button>
      )}
    </div>
  );
}
