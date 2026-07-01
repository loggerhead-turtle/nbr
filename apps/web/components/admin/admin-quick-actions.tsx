"use client";

import { useState, useTransition } from "react";
import {
  scrapeNewTeamsAction,
  recomputeRatingsAction,
  dedupeGamesAction,
  type ActionState,
} from "@/lib/admin-actions";

/**
 * Compact toolbar shown on every admin page: kick a scrape of just-added teams,
 * or a full ratings recompute, without hunting for the right page. Each reports
 * whether the Render job was actually dispatched (or why it wasn't).
 */
export function AdminQuickActions() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      setMsg(null);
      setMsg(await fn());
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => run(scrapeNewTeamsAction)}
        disabled={pending}
        className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        title="Scrape every just-added team (never scraped yet), then recompute"
      >
        {pending ? "Working…" : "Scrape new teams"}
      </button>
      <button
        type="button"
        onClick={() => run(recomputeRatingsAction)}
        disabled={pending}
        className="rounded-md bg-navy-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-50"
        title="Recompute all ratings now"
      >
        {pending ? "Working…" : "Recompute ratings"}
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Remove duplicate games across all teams? Keeps the verified copy of each matchup, then recomputes.",
            )
          )
            run(dedupeGamesAction);
        }}
        disabled={pending}
        className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
        title="Delete duplicate games left by merges (keeps the verified-opponent copy)"
      >
        {pending ? "Working…" : "Remove duplicate games"}
      </button>
      {msg?.message && (
        <span className="text-xs font-medium text-emerald-700">{msg.message}</span>
      )}
      {msg?.error && <span className="text-xs font-medium text-rose-600">{msg.error}</span>}
    </div>
  );
}
