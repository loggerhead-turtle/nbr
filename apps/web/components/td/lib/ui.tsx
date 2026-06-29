"use client";

import { ageGroupLabel } from "@/lib/format";
import { PAYMENT_STATUSES, type PaymentStatus, type TdDivision, type TdTournament } from "./types";

/** "12U · NBR I" */
export function divisionLabel(div: { ageGroup: string; nbrLevel: string }): string {
  return `${ageGroupLabel(div.ageGroup)} · ${div.nbrLevel}`;
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_STATUSES.find((p) => p.value === status) ?? PAYMENT_STATUSES[0]!;
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}

export function StatusPill({ status }: { status: TdTournament["status"] }) {
  const tone =
    status === "FINALIZED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "OPEN"
        ? "bg-sky-100 text-sky-700"
        : "bg-slate-100 text-slate-600";
  const label = status === "FINALIZED" ? "Finalized" : status === "OPEN" ? "Open" : "Draft";
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function DemoBadge() {
  return <span className="badge bg-diamond-600/10 text-diamond-600">DEMO</span>;
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyCard({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="card flex min-h-[180px] flex-col items-center justify-center p-8 text-center">
      <p className="text-3xl">{icon}</p>
      <p className="mt-2 font-semibold text-navy-900">{title}</p>
      {sub && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

/** Roster + payment rollups for one tournament. */
export function rollups(t: TdTournament) {
  const counts: Record<PaymentStatus, number> = { PENCILED: 0, INVITED: 0, DEPOSIT_PAID: 0, PAID: 0 };
  for (const inv of t.invites) counts[inv.paymentStatus] += 1;
  return {
    total: t.invites.length,
    paid: counts.PAID,
    deposit: counts.DEPOSIT_PAID,
    invited: counts.INVITED,
    penciled: counts.PENCILED,
  };
}

export function divisionTeamCount(t: TdTournament, div: TdDivision): number {
  return t.invites.filter((i) => i.divisionId === div.id).length;
}
