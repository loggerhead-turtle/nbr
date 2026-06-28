"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportClaimForm } from "./report-form";

interface ContactInfo {
  claimed: boolean;
  coachName?: string;
  optIn?: boolean;
  signedIn?: boolean;
  canView?: boolean;
  email?: string;
  phone?: string | null;
}

/** Claimed-team contact card. Email/phone are fetched per-viewer (gated server-side). */
export function TeamContact({ teamId, teamSlug }: { teamId: string; teamSlug: string }) {
  const [info, setInfo] = useState<ContactInfo | null>(null);

  useEffect(() => {
    fetch(`/api/teams/${teamId}/contact`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ claimed: false }));
  }, [teamId]);

  if (!info) return null;

  if (!info.claimed) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-bold text-navy-900">Is this your team?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Claim it to manage its info and find scrimmages with similarly-rated teams.
        </p>
        <Link href={`/claim/${teamSlug}`} className="btn-accent mt-3">
          Claim this team
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold text-navy-900">Team contact</h2>
      <p className="mt-1 text-sm text-slate-600">
        Claimed by <strong>{info.coachName || "a verified coach"}</strong>
      </p>

      {info.canView ? (
        <dl className="mt-3 space-y-1 text-sm">
          {info.email && (
            <div className="flex gap-2">
              <dt className="text-slate-400">Email</dt>
              <dd>
                <a href={`mailto:${info.email}`} className="text-navy-700 underline">
                  {info.email}
                </a>
              </dd>
            </div>
          )}
          {info.phone && (
            <div className="flex gap-2">
              <dt className="text-slate-400">Phone</dt>
              <dd className="text-slate-700">{info.phone}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          {!info.optIn
            ? "This coach has kept their contact info private."
            : !info.signedIn
              ? (
                <>
                  Contact info is shared with registered users.{" "}
                  <Link href={`/login?next=/teams/${teamSlug}`} className="font-medium text-navy-700 underline">
                    Sign in to view
                  </Link>
                  .
                </>
              )
              : "Contact info is not available."}
        </p>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <ReportClaimForm teamId={teamId} />
      </div>
    </div>
  );
}
