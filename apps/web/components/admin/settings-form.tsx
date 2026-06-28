"use client";

import { useActionState } from "react";
import { setRatingAlgorithmAction, type ActionState } from "@/lib/admin-actions";
import { RATING_ALGORITHMS, type RatingAlgorithmId } from "@nbr/core";

const initial: ActionState = {};

export function RatingAlgorithmForm({ current }: { current: RatingAlgorithmId }) {
  const [state, action, pending] = useActionState(setRatingAlgorithmAction, initial);

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="font-bold text-navy-900">Rating algorithm</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose the statistical evaluation model used when ratings are recomputed. The
          change takes effect on the next recompute.
        </p>
      </div>

      <fieldset className="space-y-3">
        {RATING_ALGORITHMS.map((a) => (
          <label
            key={a.id}
            className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
          >
            <input
              type="radio"
              name="algorithm"
              value={a.id}
              defaultChecked={a.id === current}
              className="mt-1"
            />
            <span>
              <span className="font-semibold text-navy-900">{a.label}</span>
              <span className="mt-0.5 block text-sm text-slate-600">{a.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
