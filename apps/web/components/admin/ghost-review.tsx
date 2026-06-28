"use client";

import { useState, useTransition, type FormEvent } from "react";
import { mergeGhostAction, searchMergeTargets } from "@/lib/admin-actions";
import type { MergeTargetOption } from "@/lib/merge-types";
import type { GhostTeamWithSuggestions, GhostMergeSuggestion } from "@nbr/db";
import type { MergeTier } from "@nbr/core";

const TIER_STYLE: Record<MergeTier, { bar: string; chip: string; label: string }> = {
  high: { bar: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800", label: "High" },
  medium: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", label: "Medium" },
  low: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-800", label: "Low" },
  none: { bar: "bg-slate-400", chip: "bg-slate-200 text-slate-700", label: "No match" },
};

const gcUrl = (id: string) => `https://web.gc.com/teams/${id}/schedule`;

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
        <span className="font-semibold">{ghost.name}</span>
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
          <p className="truncate font-semibold text-slate-800">
            {s.targetName}
            {s.targetGcTeamId && (
              <a
                href={gcUrl(s.targetGcTeamId)}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-xs font-normal text-sky-600 underline hover:text-sky-800"
              >
                GameChanger ↗
              </a>
            )}
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
    </div>
  );
}
