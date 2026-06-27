"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="card mx-auto mt-16 max-w-sm p-6">
      <h1 className="text-xl font-bold text-navy-900">Admin sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Restricted area.</p>
      <label className="label mt-4" htmlFor="password">
        Password
      </label>
      <input id="password" name="password" type="password" className="input" autoFocus />
      {state.error && <p className="mt-2 text-sm font-medium text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary mt-4 w-full disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
