"use client";

import { useActionState } from "react";
import {
  updateProfileAction,
  changePasswordAction,
  type AccountState,
} from "@/lib/account-actions";

const initial: AccountState = {};

export interface ProfileValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Whether the account already has a password (controls the "current password" field). */
  hasPassword: boolean;
}

export function ProfileSettings({ values }: { values: ProfileValues }) {
  const [pState, pAction, pPending] = useActionState(updateProfileAction, initial);
  const [wState, wAction, wPending] = useActionState(changePasswordAction, initial);

  return (
    <div className="space-y-6">
      {/* Profile */}
      <form action={pAction} className="card space-y-4 p-5">
        <h3 className="font-bold text-navy-900">Profile</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input id="firstName" name="firstName" defaultValue={values.firstName} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Last name</label>
            <input id="lastName" name="lastName" defaultValue={values.lastName} required className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={values.email} required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Phone <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="phone" name="phone" type="tel" defaultValue={values.phone} className="input" autoComplete="tel" />
        </div>
        {pState.error && <p className="text-sm font-medium text-rose-600">{pState.error}</p>}
        {pState.ok && pState.message && <p className="text-sm font-medium text-emerald-600">{pState.message}</p>}
        <button type="submit" disabled={pPending} className="btn-primary disabled:opacity-50">
          {pPending ? "Saving…" : "Save profile"}
        </button>
      </form>

      {/* Password */}
      <form action={wAction} className="card space-y-4 p-5">
        <h3 className="font-bold text-navy-900">Change password</h3>
        {values.hasPassword && (
          <div>
            <label className="label" htmlFor="currentPassword">Current password</label>
            <input id="currentPassword" name="currentPassword" type="password" required className="input" autoComplete="current-password" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" required minLength={8} className="input" autoComplete="new-password" />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} className="input" autoComplete="new-password" />
        </div>
        {wState.error && <p className="text-sm font-medium text-rose-600">{wState.error}</p>}
        {wState.ok && wState.message && <p className="text-sm font-medium text-emerald-600">{wState.message}</p>}
        <button type="submit" disabled={wPending} className="btn-primary disabled:opacity-50">
          {wPending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
