"use client";

import { useActionState } from "react";
import { reportClaimAction, type AccountState } from "@/lib/account-actions";

const initial: AccountState = {};

export function ReportClaimForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState(reportClaimAction, initial);

  if (state.ok) {
    return <p className="text-sm font-medium text-emerald-700">✓ {state.message}</p>;
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-500 hover:text-rose-600">
        Report this claim as incorrect
      </summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <input
          name="reason"
          required
          placeholder="Reason (e.g. I coach this team)"
          className="input"
        />
        <textarea name="details" rows={2} placeholder="Any details (optional)" className="input" />
        {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-50">
          {pending ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </details>
  );
}
