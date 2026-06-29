"use client";

import { useState } from "react";
import { useTd } from "../lib/td-context";
import { DemoBadge, SectionTitle, StatusPill, rollups } from "../lib/ui";
import { money, shortDate } from "../lib/util";

export function DashboardView() {
  const { tournaments, select, setTab, act, mode } = useTd();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (name.trim().length < 2) return;
    const t = await act((p) => p.createTournament({ name: name.trim() }));
    setName("");
    setCreating(false);
    select(t.id);
    setTab("build");
  };

  const manage = (id: string) => {
    select(id);
    setTab("build");
  };

  const totalInvites = tournaments.reduce((s, t) => s + t.invites.length, 0);
  const totalPaid = tournaments.reduce((s, t) => s + t.invites.filter((i) => i.paymentStatus === "PAID").length, 0);
  const repeatCount = tournaments.reduce(
    (s, t) => s + new Set(t.invites.filter((i) => i.isRepeatCustomer).map((i) => i.team.id)).size,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Tournaments" value={tournaments.length} />
        <Kpi label="Teams invited" value={totalInvites} />
        <Kpi label="Paid in full" value={totalPaid} tone="emerald" />
        <Kpi label="Repeat customers" value={repeatCount} tone="sky" />
      </div>

      <div>
        <SectionTitle
          title="Your tournaments"
          sub={mode === "demo" ? "Sample tournaments — manage any of them, or create your own." : "Tournaments you direct."}
          action={
            <button onClick={() => setCreating((v) => !v)} className="btn-accent">
              + New tournament
            </button>
          }
        />

        {creating && (
          <div className="card mb-3 flex flex-wrap items-end gap-2 p-4">
            <div className="min-w-[220px] flex-1">
              <label className="label">Tournament name</label>
              <input
                className="input"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="e.g. Summer Slugfest"
              />
            </div>
            <button onClick={create} className="btn-primary">Create & build</button>
            <button onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {tournaments.map((t) => {
            const r = rollups(t);
            return (
              <button
                key={t.id}
                onClick={() => manage(t.id)}
                className="card p-4 text-left transition hover:border-navy-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy-900">{t.name}</span>
                      {mode === "demo" && <DemoBadge />}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {shortDate(t.startDate)} · {t.location ?? "Location TBD"}
                    </p>
                  </div>
                  <StatusPill status={t.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>{t.divisions.length} division{t.divisions.length === 1 ? "" : "s"}</span>
                  <span>{r.total} team{r.total === 1 ? "" : "s"}</span>
                  <span>Entry {money(t.entryFee)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Tally tone="emerald" n={r.paid} label="paid" />
                  <Tally tone="amber" n={r.deposit} label="deposit" />
                  <Tally tone="sky" n={r.invited} label="invited" />
                  <Tally tone="slate" n={r.penciled} label="penciled" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "navy" }: { label: string; value: number; tone?: string }) {
  const color =
    tone === "emerald" ? "text-emerald-600" : tone === "sky" ? "text-sky-600" : "text-navy-900";
  return (
    <div className="card p-4">
      <p className={`text-3xl font-black tabular-nums ${color}`}>{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    sky: "bg-sky-100 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`badge ${tones[tone]}`}>
      {n} {label}
    </span>
  );
}
