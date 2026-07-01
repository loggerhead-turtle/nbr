"use client";

import { useState, useTransition } from "react";
import { cleanGhostsAction, type ActionState } from "@/lib/admin-actions";

/**
 * Clean up ghosts: merge duplicate ghosts (same name + age) into one AND delete
 * empty ones. Runs as a BACKGROUND job so it scales to thousands of ghosts
 * without timing out. Safe — only ghosts are touched.
 */
export function MergeDuplicateGhosts() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  const run = () => {
    if (
      !window.confirm(
        "Clean up ghosts now?\n\n" +
          "Merges duplicate ghosts (same name + age) into one and deletes empty ghosts. " +
          "Runs in the background; safe — only ghosts are touched.",
      )
    )
      return;
    startTransition(async () => {
      setMsg(await cleanGhostsAction());
    });
  };

  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          Repeated scrapes can create <strong>duplicate ghosts</strong> of the same opponent —
          merge them and remove empties (runs in the background).
        </p>
        <button onClick={run} disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Starting…" : "Clean up ghosts"}
        </button>
      </div>
      {msg?.message && <p className="mt-1 text-xs font-medium text-emerald-700">{msg.message}</p>}
      {msg?.error && <p className="mt-1 text-xs font-medium text-rose-600">{msg.error}</p>}
    </div>
  );
}
