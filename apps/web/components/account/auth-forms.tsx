"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginUserAction, signupAction, type AccountState } from "@/lib/account-actions";
import { HONEYPOT_FIELD } from "@/lib/spam-constants";

const initial: AccountState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginUserAction, initial);
  return (
    <form action={action} className="card mx-auto mt-10 max-w-md space-y-4 p-6">
      <h1 className="text-xl font-bold text-navy-900">Sign in</h1>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
      </div>
      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-navy-700 underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signupAction, initial);
  return (
    <form action={action} className="card mx-auto mt-10 max-w-md space-y-4 p-6">
      <h1 className="text-xl font-bold text-navy-900">Create your account</h1>
      <p className="text-sm text-slate-500">
        Create an account to claim your team, find scrimmages, and manage your profile.
      </p>
      <input type="hidden" name="next" value={next ?? ""} />
      {/* Honeypot: hidden from real users; bots that fill it are rejected. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>Company website</label>
        <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" required className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Phone <span className="font-normal text-slate-400">(optional)</span></label>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      <p className="text-xs text-slate-500">
        Your email and phone are kept private. They’re only shared with other registered users if
        you turn on contact sharing for a team you claim. See our{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
      {state.error && <p className="text-sm font-medium text-rose-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-accent w-full disabled:opacity-50">
        {pending ? "Creating…" : "Create account"}
      </button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-navy-700 underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
