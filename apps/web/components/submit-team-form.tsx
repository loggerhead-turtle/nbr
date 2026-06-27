"use client";

import { useActionState } from "react";
import { submitTeamAction } from "@/lib/public-actions";
import type { ActionState } from "@/lib/admin-actions";
import { AGE_GROUPS } from "@nbr/core";

const initial: ActionState = {};

export function SubmitTeamForm() {
  const [state, action, pending] = useActionState(submitTeamAction, initial);

  if (state.ok && state.message) {
    return (
      <div className="card max-w-xl p-6">
        <p className="text-lg font-semibold text-emerald-700">✓ {state.message}</p>
        <a href="/" className="btn-ghost mt-4">
          Back to ratings
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="card max-w-xl space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">
          Team name *
        </label>
        <input id="name" name="name" required className="input" placeholder="SLC Thunder 12U" />
      </div>
      <div>
        <label className="label" htmlFor="gcTeamId">
          GameChanger team ID *
        </label>
        <input id="gcTeamId" name="gcTeamId" required className="input" placeholder="21nCCNFQXjHB" />
        <p className="mt-1 text-xs text-slate-500">
          Open the team on GameChanger; the ID is in the URL:
          web.gc.com/teams/<b>THIS-PART</b>/schedule.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="ageGroup">
            Age group
          </label>
          <select id="ageGroup" name="ageGroup" className="input" defaultValue="">
            <option value="">—</option>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">
            City
          </label>
          <input id="city" name="city" className="input" placeholder="Salt Lake City" />
        </div>
      </div>
      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
        {pending ? "Submitting…" : "Submit team"}
      </button>
    </form>
  );
}
