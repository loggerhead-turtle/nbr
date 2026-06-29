"use client";

import { useState } from "react";
import { useTd } from "../lib/td-context";
import { formatRating } from "@/lib/format";
import { PaymentPill, SectionTitle, divisionLabel, EmptyCard } from "../lib/ui";
import { PAYMENT_STATUSES, type PaymentStatus } from "../lib/types";
import { TeamSearch } from "./team-search";

export function TeamsView() {
  const { selected } = useTd();
  if (!selected) return null;
  const t = selected;

  if (t.divisions.length === 0) {
    return <EmptyCard icon="📋" title="No divisions yet" sub="Add divisions in the Build tab, then invite teams here." />;
  }

  return (
    <div className="space-y-6">
      {t.divisions.map((d) => (
        <DivisionInvites key={d.id} divisionId={d.id} />
      ))}
    </div>
  );
}

function DivisionInvites({ divisionId }: { divisionId: string }) {
  const { selected, act } = useTd();
  const t = selected!;
  const div = t.divisions.find((d) => d.id === divisionId)!;
  const roster = t.invites
    .filter((i) => i.divisionId === divisionId)
    .sort((a, b) => (b.team.nbr ?? 0) - (a.team.nbr ?? 0));
  const [adding, setAdding] = useState(false);
  const excludeIds = new Set(roster.map((i) => i.team.id));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="font-bold text-navy-900">
          {divisionLabel(div)} <span className="text-sm font-normal text-slate-500">· {roster.length} team{roster.length === 1 ? "" : "s"}</span>
        </h3>
        <button onClick={() => setAdding((v) => !v)} className="btn-ghost">{adding ? "Done adding" : "+ Add teams"}</button>
      </div>

      {adding && (
        <div className="border-b border-slate-100 p-4">
          <TeamSearch
            defaultAge={div.ageGroup}
            defaultNbrMin={div.nbrMin}
            defaultNbrMax={div.nbrMax}
            excludeIds={excludeIds}
            onPick={(team) => act((p) => p.invite(t.id, div.id, team))}
          />
        </div>
      )}

      {roster.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">No teams invited to this division yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2">Team</th>
              <th className="px-4 py-2 text-right">NBR</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roster.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-navy-800">{i.team.name}</span>
                  {i.isRepeatCustomer && (
                    <span className="badge ml-2 bg-violet-100 text-violet-700">repeat</span>
                  )}
                  <div className="text-xs text-slate-400">{i.team.city ? `${i.team.city}, ${i.team.state}` : i.team.state}</div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy-800">{i.team.nbr != null ? formatRating(i.team.nbr) : "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <PaymentPill status={i.paymentStatus} />
                    <select
                      className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                      value={i.paymentStatus}
                      onChange={(e) => act((p) => p.setPaymentStatus(t.id, i.id, e.target.value as PaymentStatus))}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => act((p) => p.removeInvite(t.id, i.id))}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label={`Remove ${i.team.name}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
