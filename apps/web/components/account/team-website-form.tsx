"use client";

import { useActionState } from "react";
import { updateTeamWebsiteAction } from "@/lib/account-actions";
import type { AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function TeamWebsiteForm({ teamId, website }: { teamId: string; website: string | null }) {
  const [state, action, pending] = useActionState(updateTeamWebsiteAction, initial);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="min-w-[220px] flex-1">
        <label className="label">Team website (your own site, optional)</label>
        <input
          name="website"
          defaultValue={website ?? ""}
          placeholder="https://yourteam.com"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-400">
          Your GameChanger page is linked automatically from the team ID.
        </p>
      </div>
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-50">
        {pending ? "Saving…" : "Save website"}
      </button>
      {state.error && <p className="w-full text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-emerald-600">{state.message}</p>}
    </form>
  );
}
