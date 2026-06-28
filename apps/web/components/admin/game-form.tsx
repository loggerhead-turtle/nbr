"use client";

import { useActionState } from "react";
import { createGameAction, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

interface TeamOption {
  id: string;
  name: string;
  ageGroup: string | null;
}

export function GameForm({ teams }: { teams: TeamOption[] }) {
  const [state, action, pending] = useActionState(createGameAction, initial);
  const label = (t: TeamOption) => `${t.name}${t.ageGroup ? ` (${t.ageGroup})` : ""}`;

  return (
    <form action={action} className="card max-w-xl space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="homeTeamId">
            Home team *
          </label>
          <select id="homeTeamId" name="homeTeamId" required className="input" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {label(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="awayTeamId">
            Away team *
          </label>
          <select id="awayTeamId" name="awayTeamId" required className="input" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {label(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="homeScore">
            Home score *
          </label>
          <input id="homeScore" name="homeScore" type="number" min={0} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="awayScore">
            Away score *
          </label>
          <input id="awayScore" name="awayScore" type="number" min={0} required className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="playedAt">
          Date played *
        </label>
        <input id="playedAt" name="playedAt" type="date" required className="input w-48" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="neutralSite" className="h-4 w-4 shrink-0" /> Neutral site (tournament) — skip home-field
        adjustment
      </label>

      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <input id="notes" name="notes" className="input" placeholder="Optional" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="confirmDuplicate" value="1" className="h-4 w-4 shrink-0" /> Allow duplicate (doubleheader)
      </label>

      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : "Record game"}
      </button>
    </form>
  );
}
