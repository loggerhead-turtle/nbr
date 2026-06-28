"use client";

import { useActionState } from "react";
import { requestTdAction } from "@/lib/tournament-actions";
import type { AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function TdRequestForm({
  tournamentName,
  org,
  website,
}: {
  tournamentName: string | null;
  org: string | null;
  website: string | null;
}) {
  const [state, action, pending] = useActionState(requestTdAction, initial);

  if (state.ok) {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
        ✓ {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-500">
        Run your own tournament? Request tournament-director access. An administrator will review
        your request.
      </p>
      <div>
        <label className="label">Tournament name</label>
        <input name="tournamentName" defaultValue={tournamentName ?? ""} className="input" placeholder="Summer Slugfest" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Organization</label>
          <input name="org" defaultValue={org ?? ""} className="input" placeholder="Wasatch Baseball Club" />
        </div>
        <div>
          <label className="label">Website</label>
          <input name="website" defaultValue={website ?? ""} className="input" placeholder="https://…" />
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Submitting…" : "Request tournament-director access"}
      </button>
    </form>
  );
}
