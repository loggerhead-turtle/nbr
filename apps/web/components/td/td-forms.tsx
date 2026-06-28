"use client";

import { useActionState } from "react";
import { updateTdProfileAction, createTournamentAction } from "@/lib/tournament-actions";
import type { AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function TdProfileForm({
  tournamentName,
  org,
  website,
}: {
  tournamentName: string | null;
  org: string | null;
  website: string | null;
}) {
  const [state, action, pending] = useActionState(updateTdProfileAction, initial);
  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="font-bold text-navy-900">Director profile</h2>
      <div>
        <label className="label">Tournament name</label>
        <input name="tournamentName" defaultValue={tournamentName ?? ""} className="input" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Organization</label>
          <input name="org" defaultValue={org ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Website</label>
          <input name="website" defaultValue={website ?? ""} className="input" />
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.message}</p>}
      <button disabled={pending} className="btn-ghost disabled:opacity-50">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

export function CreateTournamentForm() {
  const [state, action, pending] = useActionState(createTournamentAction, initial);
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-5">
      <div className="flex-1">
        <label className="label">New tournament</label>
        <input name="name" className="input" placeholder="Summer Slugfest 12U" />
      </div>
      {state.error && <p className="w-full text-sm text-rose-600">{state.error}</p>}
      <button disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
