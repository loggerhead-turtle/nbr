"use client";

import { useActionState } from "react";
import { setScrapePayAction, type ActionState } from "@/lib/admin-actions";
import type { ScrapeGoals } from "@nbr/db";

export function ScrapePaySettings({
  rateCents,
  goals,
}: {
  rateCents: number;
  goals: ScrapeGoals;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setScrapePayAction, {});
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold text-navy-900">Pay &amp; goals</h2>
        <p className="text-sm text-slate-500">
          Rate is per team added. Goals drive the progress bars scrapers see.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="rateCents">
            Rate (¢/team)
          </label>
          <input
            id="rateCents"
            name="rateCents"
            type="number"
            min={0}
            step={1}
            defaultValue={rateCents}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="daily">
            Daily goal
          </label>
          <input id="daily" name="daily" type="number" min={0} defaultValue={goals.daily} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="weekly">
            Weekly goal
          </label>
          <input id="weekly" name="weekly" type="number" min={0} defaultValue={goals.weekly} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="monthly">
            Monthly goal
          </label>
          <input id="monthly" name="monthly" type="number" min={0} defaultValue={goals.monthly} className="input" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok && state.message && (
          <span className="text-sm font-medium text-emerald-700">{state.message}</span>
        )}
        {state.error && <span className="text-sm font-medium text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}
