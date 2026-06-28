"use client";

import { useActionState } from "react";
import { claimTeamAction, type AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function ClaimForm({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [state, action, pending] = useActionState(claimTeamAction, initial);
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">You are claiming: {teamName}</p>
        <p className="mt-1">
          Only claim a team you coach or represent. Claiming a team that isn’t yours may result in
          the claim being removed and your account suspended. False claims can be reported by others.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="confirm" className="mt-1" />
        <span>
          I confirm I am the coach or an authorized representative of <strong>{teamName}</strong>.
        </span>
      </label>

      <div>
        <label className="label" htmlFor="zip">
          Team ZIP code <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="zip" name="zip" className="input w-40" placeholder="84101" inputMode="numeric" />
        <p className="mt-1 text-xs text-slate-500">
          Adding your ZIP lets you find similarly-skilled teams in your area for scrimmages.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="contactOptIn" className="mt-1" />
        <span>
          Allow other <strong>registered users</strong> to see my email and phone for scrimmage
          requests. (Off by default — your contact info stays private.)
        </span>
      </label>

      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
        {pending ? "Claiming…" : "Claim this team"}
      </button>
    </form>
  );
}
