"use client";

import { useActionState } from "react";
import { createTeamAction, type ActionState } from "@/lib/admin-actions";
import { AGE_GROUPS } from "@nbr/core";

const initial: ActionState = {};

export function TeamForm() {
  const [state, action, pending] = useActionState(createTeamAction, initial);
  return (
    <form action={action} className="card max-w-xl space-y-4 p-6" key={state.ok ? Math.random() : "f"}>
      <div>
        <label className="label" htmlFor="name">
          Team name *
        </label>
        <input id="name" name="name" required className="input" placeholder="SLC Thunder" />
      </div>

      <div>
        <label className="label" htmlFor="gcTeamId">
          GameChanger team ID
        </label>
        <input
          id="gcTeamId"
          name="gcTeamId"
          className="input"
          placeholder="e.g. 21nCCNFQXjHB"
        />
        <p className="mt-1 text-xs text-slate-500">
          Found in the team’s GameChanger URL: web.gc.com/teams/<b>ID</b>/schedule. Leave blank
          for manual-only teams.
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
          <label className="label" htmlFor="division">
            Division
          </label>
          <input id="division" name="division" className="input" placeholder="AAA, Majors…" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label" htmlFor="city">
            City
          </label>
          <input id="city" name="city" className="input" placeholder="Salt Lake City" />
        </div>
        <div>
          <label className="label" htmlFor="state">
            State
          </label>
          <input id="state" name="state" defaultValue="UT" maxLength={2} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="zip">
          ZIP code
        </label>
        <input id="zip" name="zip" className="input w-32" placeholder="84101" />
      </div>

      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : "Add team"}
      </button>
    </form>
  );
}
