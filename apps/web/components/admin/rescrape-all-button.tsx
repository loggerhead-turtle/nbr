"use client";

import { useState, useTransition } from "react";
import { rescrapeAllAction, type ActionState } from "@/lib/admin-actions";

/**
 * Admin: deliberate one-off full re-scrape of every team (e.g. to backfill new
 * fields). Separate from the on-add scrape; run when ready.
 */
export function RescrapeAllButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Re-scrape ALL teams? This is a long one-off job (many minutes) that refreshes every team's data. Run it when you're ready.",
            )
          )
            return;
          start(async () => {
            setMsg(null);
            setMsg(await rescrapeAllAction());
          });
        }}
        className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        title="Full re-scrape of every team — a deliberate one-off"
      >
        {pending ? "Starting…" : "Re-scrape ALL teams"}
      </button>
      {msg?.message && <span className="text-xs font-medium text-emerald-700">{msg.message}</span>}
      {msg?.error && <span className="text-xs font-medium text-rose-600">{msg.error}</span>}
    </span>
  );
}
