"use client";

import { useTd } from "../lib/td-context";
import { PaymentPill, SectionTitle, divisionLabel, rollups, EmptyCard } from "../lib/ui";
import { money } from "../lib/util";
import { PAYMENT_STATUSES, type PaymentStatus } from "../lib/types";

export function PaymentsView() {
  const { selected, act } = useTd();
  if (!selected) return null;
  const t = selected;
  const r = rollups(t);

  if (t.invites.length === 0) {
    return <EmptyCard icon="💳" title="No teams yet" sub="Invite teams to start tracking deposits and payments." />;
  }

  const collected =
    t.invites.filter((i) => i.paymentStatus === "PAID").length * (t.entryFee ?? 0) +
    t.invites.filter((i) => i.paymentStatus === "DEPOSIT_PAID").length * (t.depositAmount ?? 0);
  const expected = r.total * (t.entryFee ?? 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span className="font-semibold text-navy-800">Illustration only.</span> This previews the payment
        tracking and structure — online deposits, balances, and payouts are a planned release. No real
        payment is processed here.
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Money label="Entry fee" value={money(t.entryFee)} />
        <Money label="Deposit" value={money(t.depositAmount)} />
        <Money label="Collected (est.)" value={money(collected)} tone="emerald" />
        <Money label="Expected total" value={money(expected)} />
      </div>

      <div>
        <SectionTitle title="Who's paid" sub="Track deposits and balances at a glance." />
        <div className="grid gap-3 sm:grid-cols-4">
          <Tally n={r.paid} label="Paid in full" tone="emerald" />
          <Tally n={r.deposit} label="Deposit paid" tone="amber" />
          <Tally n={r.invited} label="Invited" tone="sky" />
          <Tally n={r.penciled} label="Penciled in" tone="slate" />
        </div>
      </div>

      {t.divisions.map((d) => {
        const roster = t.invites.filter((i) => i.divisionId === d.id);
        if (roster.length === 0) return null;
        return (
          <div key={d.id} className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 font-bold text-navy-900">{divisionLabel(d)}</div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {roster
                  .slice()
                  .sort((a, b) => a.team.name.localeCompare(b.team.name))
                  .map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-navy-800">{i.team.name}</td>
                      <td className="px-4 py-2.5"><PaymentPill status={i.paymentStatus} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          {PAYMENT_STATUSES.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => act((p) => p.setPaymentStatus(t.id, i.id, s.value as PaymentStatus))}
                              className={`rounded px-2 py-1 text-xs font-medium ${
                                i.paymentStatus === s.value ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {s.label.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function Money({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-black tabular-nums ${tone === "emerald" ? "text-emerald-600" : "text-navy-900"}`}>{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-2xl font-black tabular-nums">{n}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
