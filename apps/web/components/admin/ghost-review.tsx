"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  mergeGhostAction,
  searchMergeTargets,
  getGhostSplitGroupsAction,
  reassignGhostGamesAction,
  deletePhantomGamesAction,
} from "@/lib/admin-actions";
import { NbrLink, GcLink } from "./team-links";
import type { MergeTargetOption } from "@/lib/merge-types";
import type { GhostTeamWithSuggestions, GhostMergeSuggestion, GhostSplitGroup } from "@nbr/db";
import type { MergeTier } from "@nbr/core";

const TIER_STYLE: Record<MergeTier, { bar: string; chip: string; label: string }> = {
  high: { bar: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800", label: "High" },
  medium: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", label: "Medium" },
  low: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", label: "Low" },
  none: { bar: "bg-slate-400", chip: "bg-slate-200 text-slate-700", label: "No match" },
};

export function GhostReview({
  withMatch,
  orphans,
}: {
  withMatch: GhostTeamWithSuggestions[];
  orphans: GhostTeamWithSuggestions[];
}) {
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const onMerged = (id: string) => setMerged((prev) => new Set(prev).add(id));

  const liveMatch = withMatch.filter((g) => !merged.has(g.id));
  const liveOrphans = orphans.filter((g) => !merged.has(g.id));

  if (withMatch.length + orphans.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl">👻</p>
        <p className="mt-2 text-lg font-semibold text-navy-900">No ghost teams</p>
        <p className="mt-1 text-sm text-slate-500">Every opponent has a real team record.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <p className="text-sm text-slate-500">
          {liveMatch.length} ghost(s) with a suggested match.
        </p>
        {liveMatch.map((g) => (
          <GhostCard key={g.id} ghost={g} onMerged={onMerged} />
        ))}
        {liveMatch.length === 0 && (
          <p className="text-sm text-slate-400">All matched ghosts handled. 🎉</p>
        )}
      </section>

      {liveOrphans.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            No automatic match ({liveOrphans.length}) — search to merge manually
          </h2>
          {liveOrphans.map((g) => (
            <GhostCard key={g.id} ghost={g} onMerged={onMerged} />
          ))}
        </section>
      )}
    </div>
  );
}

function GhostCard({
  ghost,
  onMerged,
}: {
  ghost: GhostTeamWithSuggestions;
  onMerged: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MergeTargetOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  const doMerge = (targetId: string) => {
    const fd = new FormData();
    fd.set("ghostId", ghost.id);
    fd.set("targetId", targetId);
    startTransition(async () => {
      await mergeGhostAction(fd);
      onMerged(ghost.id);
    });
  };

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchMergeTargets(query));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className={`card overflow-hidden ${pending ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {ghost.name}
          <NbrLink slug={ghost.slug} />
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {ghost.ageGroup ?? "no age"}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {ghost.city ?? "no location"}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {ghost.totalGames} game{ghost.totalGames === 1 ? "" : "s"}
          </span>
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {ghost.suggestions.map((s) => (
          <Suggestion key={s.targetId} s={s} busy={pending} onMerge={() => doMerge(s.targetId)} />
        ))}
        {ghost.suggestions.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">
            No same-name real team found. Search below to pick a target.
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
        <GhostSplit ghost={ghost} />
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
        {!showSearch ? (
          <button
            onClick={() => setShowSearch(true)}
            className="text-sm font-medium text-sky-600 hover:text-sky-800"
          >
            Merge into a different team…
          </button>
        ) : (
          <div className="space-y-2">
            <form onSubmit={runSearch} className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search teams by name…"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                autoFocus
              />
              <button type="submit" disabled={searching} className="btn-ghost disabled:opacity-50">
                {searching ? "Searching…" : "Search"}
              </button>
            </form>
            {results && results.length === 0 && (
              <p className="text-sm text-slate-400">No teams match “{query}”.</p>
            )}
            {results && results.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                {results.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">
                      <span className="font-medium text-slate-800">{t.name}</span>{" "}
                      <span className="text-xs text-slate-400">
                        {t.city ?? "no location"} · {t.ageGroup ?? "unclassified"}
                        {t.gcTeamId ? "" : " · no GC id"}
                      </span>
                    </span>
                    <button
                      onClick={() => doMerge(t.id)}
                      disabled={pending}
                      className="btn-primary shrink-0 disabled:opacity-50"
                    >
                      Merge here
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Split a junk-drawer ghost: group its games by opponent age and send each group
 * to the right team (or delete it). The admin confirms each group's destination,
 * so a legit play-up isn't auto-misrouted.
 */
function GhostSplit({ ghost }: { ghost: GhostTeamWithSuggestions }) {
  const router = useRouter();
  const [groups, setGroups] = useState<GhostSplitGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    try {
      setGroups(await getGhostSplitGroupsAction(ghost.id));
    } finally {
      setLoading(false);
    }
  };

  const move = (gameIds: string[], targetId: string) => {
    const fd = new FormData();
    fd.set("ghostId", ghost.id);
    fd.set("targetId", targetId);
    fd.set("gameIds", gameIds.join(","));
    startTransition(async () => {
      await reassignGhostGamesAction(fd);
      await load();
      router.refresh();
    });
  };

  const del = (gameIds: string[]) => {
    if (!window.confirm(`Delete ${gameIds.length} game(s)? This can't be undone.`)) return;
    const fd = new FormData();
    fd.set("gameIds", gameIds.join(","));
    startTransition(async () => {
      await deletePhantomGamesAction(fd);
      await load();
      router.refresh();
    });
  };

  if (!groups) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="text-sm font-medium text-sky-600 hover:text-sky-800 disabled:opacity-50"
      >
        {loading ? "Loading…" : "Split games by opponent age…"}
      </button>
    );
  }
  if (groups.length === 0) return <p className="text-sm text-slate-400">No games to split.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Each group is this ghost&rsquo;s games against opponents of one age. Send each group to the
        correct same-club team, or delete it. Check play-ups before moving.
      </p>
      {groups.map((g, i) => (
        <GhostSplitGroupRow key={i} group={g} busy={pending} onMove={move} onDelete={del} />
      ))}
    </div>
  );
}

function GhostSplitGroupRow({
  group,
  busy,
  onMove,
  onDelete,
}: {
  group: GhostSplitGroup;
  busy: boolean;
  onMove: (gameIds: string[], targetId: string) => void;
  onDelete: (gameIds: string[]) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MergeTargetOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const ids = group.games.map((g) => g.gameId);

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchMergeTargets(query));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-1 text-sm font-semibold text-slate-700">
        {group.label} — {group.games.length} game{group.games.length === 1 ? "" : "s"}
      </p>
      <ul className="mb-2 max-h-32 overflow-auto text-xs text-slate-500">
        {group.games.map((g) => (
          <li key={g.gameId}>
            {g.date} · vs {g.opponent} {g.us}-{g.them}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {group.suggestedTargetId && (
          <button
            onClick={() => onMove(ids, group.suggestedTargetId!)}
            disabled={busy}
            className="btn-primary disabled:opacity-50"
          >
            Move to {group.suggestedTargetName}
          </button>
        )}
        <button onClick={() => setShowSearch((v) => !v)} className="btn-ghost">
          Choose target…
        </button>
        <button
          onClick={() => onDelete(ids)}
          disabled={busy}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {showSearch && (
        <div className="mt-2 space-y-2">
          <form onSubmit={runSearch} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams by name…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" disabled={searching} className="btn-ghost disabled:opacity-50">
              {searching ? "…" : "Search"}
            </button>
          </form>
          {results &&
            results.map((t) => (
              <button
                key={t.id}
                onClick={() => onMove(ids, t.id)}
                disabled={busy}
                className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {t.name}{" "}
                <span className="text-xs text-slate-400">{t.ageGroup ?? "?"}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Suggestion({
  s,
  busy,
  onMerge,
}: {
  s: GhostMergeSuggestion;
  busy: boolean;
  onMerge: () => void;
}) {
  const style = TIER_STYLE[s.score.tier];
  return (
    <div className="px-4 py-3">
      <div className="mb-2 h-1.5 w-full rounded bg-slate-100">
        <div className={`h-full rounded ${style.bar}`} style={{ width: `${s.score.score}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
            <span className="truncate">{s.targetName}</span>
            <NbrLink slug={s.targetSlug} />
            <GcLink gcTeamId={s.targetGcTeamId} />
          </p>
          <p className="text-xs text-slate-500">
            {s.targetCity ? `${s.targetCity}${s.targetState ? `, ${s.targetState}` : ""}` : "no location"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
            {style.label} · {s.score.score}%
          </span>
          <button onClick={onMerge} disabled={busy} className="btn-primary disabled:opacity-50">
            ✓ Merge
          </button>
        </div>
      </div>
      {(s.score.reasons.length > 0 || s.score.blockers.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.score.reasons.map((r, i) => (
            <span key={`r${i}`} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
              ✓ {r}
            </span>
          ))}
          {s.score.blockers.map((b, i) => (
            <span key={`b${i}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">
              ✗ {b}
            </span>
          ))}
        </div>
      )}

      {/* The evidence: matchups the ghost and this target both played. */}
      {s.sharedGames.length > 0 ? (
        <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Date · Opponent</th>
                <th className="px-2 py-1 text-right font-semibold">Ghost</th>
                <th className="px-2 py-1 text-right font-semibold">{s.targetName}</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.sharedGames.slice(0, 8).map((g, i) => (
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
          {s.sharedGames.length > 8 && (
            <p className="px-2 py-1 text-[10px] text-slate-400">
              +{s.sharedGames.length - 8} more shared game(s)
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          No games in common — this suggestion rests on name/location only, so verify on GameChanger
          before merging.
        </p>
      )}
    </div>
  );
}
