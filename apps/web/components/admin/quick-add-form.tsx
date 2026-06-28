"use client";

import { useActionState } from "react";
import { quickAddTeamsAction, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

export function QuickAddForm() {
  const [state, action, pending] = useActionState(quickAddTeamsAction, initial);
  return (
    <form action={action} className="card space-y-3 p-6">
      <div>
        <h2 className="text-lg font-bold text-navy-900">Quick add by GameChanger ID</h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste one or more team IDs (one per line, or separated by spaces/commas). We’ll add
          them now and fill in each team’s name, city, and age group automatically on the next
          scrape — no typing required.
        </p>
      </div>
      <textarea
        name="ids"
        rows={6}
        className="input font-mono text-sm"
        placeholder={"7smnXhUAqriv\n21nCCNFQXjHB\n…"}
      />
      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Adding…" : "Add teams"}
      </button>
    </form>
  );
}
