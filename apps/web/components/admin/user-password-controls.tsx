"use client";

import { useActionState, useState } from "react";
import {
  setUserPasswordAction,
  resetUserPasswordAction,
  type ActionState,
} from "@/lib/admin-actions";

const initial: ActionState = {};

/**
 * Per-user password management for the admin Users page:
 *  • "Change password" — type a specific password for the user to sign in with.
 *  • "Password reset"  — generate a new random password and email it to them.
 */
export function UserPasswordControls({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [setState, setAction, setPending] = useActionState(setUserPasswordAction, initial);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPasswordAction, initial);

  const error = setState.error || resetState.error;
  const message = (setState.ok && setState.message) || (resetState.ok && resetState.message) || null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost text-slate-600"
        >
          Change password
        </button>
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={resetPending}
            className="btn-ghost text-amber-700 disabled:opacity-50"
            onClick={(e) => {
              if (!confirm(`Reset the password for ${email} and email them a new one?`)) {
                e.preventDefault();
              }
            }}
          >
            {resetPending ? "Resetting…" : "Password reset"}
          </button>
        </form>
      </div>

      {open && (
        <form action={setAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <input
            name="password"
            type="text"
            autoComplete="off"
            placeholder="New password (min 8)"
            className="input h-8 w-48 text-xs"
          />
          <button
            type="submit"
            disabled={setPending}
            className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
          >
            {setPending ? "Saving…" : "Set"}
          </button>
        </form>
      )}

      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
      {message && <span className="text-xs font-medium text-emerald-600">{message}</span>}
    </div>
  );
}
