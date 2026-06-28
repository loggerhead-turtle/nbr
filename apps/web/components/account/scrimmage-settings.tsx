"use client";

import { useActionState } from "react";
import { updateScrimmagePrefAction } from "@/lib/scrimmage-actions";
import type { AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function ScrimmageSettings({
  teamId,
  seeking,
  maxDistanceMiles,
  notes,
}: {
  teamId: string;
  seeking: boolean;
  maxDistanceMiles: number | null;
  notes: string | null;
}) {
  const [state, action, pending] = useActionState(updateScrimmagePrefAction, initial);
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="teamId" value={teamId} />
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" name="seekingScrimmage" defaultChecked={seeking} />
        Looking for scrimmages
      </label>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label">Max distance (mi)</label>
          <input
            name="maxDistanceMiles"
            defaultValue={maxDistanceMiles ?? ""}
            className="input w-28"
            inputMode="numeric"
            placeholder="any"
          />
        </div>
        <div className="flex-1">
          <label className="label">Notes for other coaches</label>
          <input name="notes" defaultValue={notes ?? ""} className="input" placeholder="e.g. weekends, home or away" />
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-50">
        {pending ? "Saving…" : "Save scrimmage settings"}
      </button>
    </form>
  );
}
