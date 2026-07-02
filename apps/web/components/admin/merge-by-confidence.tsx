"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mergeDuplicatesByConfidenceAction, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

/**
 * Threshold-based bulk merge. The admin picks a minimum merge-confidence % (100,
 * 99, 96, …) and merges every listed pair at or above it. `confidences` are the
 * merge-confidence values of the pairs currently on the page, so the count next
 * to the button updates live as the threshold changes. The action re-derives the
 * pairs server-side (and works a batch at a time), so it stays correct and fast
 * even with a large backlog.
 */
export function MergeByConfidence({ confidences }: { confidences: number[] }) {
  const [minPct, setMinPct] = useState(100);
  const [state, action, pending] = useActionState(mergeDuplicatesByConfidenceAction, initial);
  const router = useRouter();

  const matching = useMemo(
    () => confidences.filter((c) => c >= minPct).length,
    [confidences, minPct],
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Merge every duplicate at ${minPct}% confidence or higher?\n\n` +
              "Each folds the duplicate into the kept record and combines their games — " +
              "nothing is lost, but this can't be undone. Large backlogs merge a batch at a " +
              "time; run it again to keep going.",
          )
        ) {
          e.preventDefault();
          return;
        }
        // Refresh once the action settles so merged pairs drop off the list.
        setTimeout(() => router.refresh(), 0);
      }}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        Merge all at or above
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
        disabled={pending}
        title="Merges every pair whose merge confidence is at or above the chosen %. Ratings recompute after."
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Merging…" : `⚡ Merge ≥ ${minPct}%`}
      </button>
      <span className="text-sm text-slate-500">
        {matching} of {confidences.length} listed pair{confidences.length === 1 ? "" : "s"} match
      </span>
      {state.error && <span className="text-sm font-medium text-rose-600">{state.error}</span>}
      {state.ok && state.message && (
        <span className="text-sm font-medium text-emerald-700">{state.message}</span>
      )}
    </form>
  );
}
