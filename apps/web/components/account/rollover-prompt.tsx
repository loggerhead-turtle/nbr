"use client";

import { useActionState } from "react";
import { createSuccessorAction } from "@/lib/season-actions";
import type { AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function RolloverPrompt({
  teams,
  seasonYear,
}: {
  teams: { id: string; name: string }[];
  seasonYear: number;
}) {
  const [state, action, pending] = useActionState(createSuccessorAction, initial);

  if (state.ok) {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">
        ✓ {state.message}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-navy-700 bg-navy-50 p-5">
      <h2 className="text-lg font-black text-navy-900">It’s a new season ({seasonYear}) 🎉</h2>
      <p className="mt-1 text-sm text-slate-600">
        Most teams register a new GameChanger team each year. Add your team’s
        <strong> new GameChanger ID</strong> so its rating and record carry over instead of
        starting from scratch.
      </p>
      {teams.map((t) => (
        <form key={t.id} action={action} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="predecessorTeamId" value={t.id} />
          <div className="flex-1">
            <label className="label">
              New ID for <strong>{t.name}</strong>’s {seasonYear} season
            </label>
            <input name="gcTeamId" className="input font-mono" placeholder="e.g. 21nCCNFQXjHB" />
          </div>
          <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
            {pending ? "Linking…" : "Create new-season team"}
          </button>
        </form>
      ))}
      {state.error && <p className="mt-2 text-sm font-medium text-rose-600">{state.error}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Don’t have a new team yet? You can do this later — your old team stays until you link it.
      </p>
    </div>
  );
}
