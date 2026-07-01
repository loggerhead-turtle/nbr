"use client";

import { useState, useTransition } from "react";
import { rescrapeRecentAction, type ActionState } from "@/lib/admin-actions";

/** Admin: re-scrape recently added teams to fix mislabeled locations. */
export function RescrapeRecentButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            setMsg(await rescrapeRecentAction());
          })
        }
        className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
        title="Reset recently added teams so the scraper re-fetches their state/city"
      >
        {pending ? "Working…" : "Fix locations (re-scrape recent)"}
      </button>
      {msg?.message && <span className="text-xs font-medium text-emerald-700">{msg.message}</span>}
      {msg?.error && <span className="text-xs font-medium text-rose-600">{msg.error}</span>}
    </span>
  );
}
