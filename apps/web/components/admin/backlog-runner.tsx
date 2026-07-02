"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { startDuplicateBacklogAction, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

/**
 * Start control for the background duplicate-backlog merge. Pick a minimum
 * confidence and dispatch the worker job; a running job's progress and merge log
 * show below on the page (Refresh to update).
 */
export function BacklogRunner({ defaultMinPct, running }: { defaultMinPct: number; running: boolean }) {
  const [minPct, setMinPct] = useState(defaultMinPct);
  const [state, action, pending] = useActionState(startDuplicateBacklogAction, initial);
  const router = useRouter();

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Start the backlog merge at ${minPct}% confidence or higher?\n\n` +
              "The worker will fold every qualifying duplicate into its kept record and log each " +
              "merge below. This runs in the background and can't be undone.",
          )
        ) {
          e.preventDefault();
          return;
        }
        setTimeout(() => router.refresh(), 400);
      }}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        Merge everything at or above
        <span className="flex items-center">
          <input
            type="number"
            name="minPct"
            min={1}
            max={100}
            value={minPct}
            onChange={(e) => setMinPct(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
            className="input h-9 w-20 text-right"
          />
          <span className="ml-1 text-slate-500">%</span>
        </span>
      </label>
      <button
        type="submit"
        disabled={pending || running}
        title="Dispatch the background worker to merge the whole backlog at this confidence."
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {running ? "A run is in progress…" : pending ? "Starting…" : "▶ Start backlog merge"}
      </button>
      {state.error && <span className="text-sm font-medium text-rose-600">{state.error}</span>}
      {state.ok && state.message && (
        <span className="text-sm font-medium text-emerald-700">{state.message}</span>
      )}
    </form>
  );
}
