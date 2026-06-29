"use client";

import { useState } from "react";
import { useTd, type TdTab } from "./lib/td-context";
import { DemoBadge, StatusPill } from "./lib/ui";
import { DashboardView } from "./views/dashboard-view";
import { BuildView } from "./views/build-view";
import { TeamsView } from "./views/teams-view";
import { PaymentsView } from "./views/payments-view";
import { PoolsView } from "./views/pools-view";
import { ScheduleView } from "./views/schedule-view";
import { UmpiresView } from "./views/umpires-view";
import { BracketsView } from "./views/brackets-view";
import { MessagesView } from "./views/messages-view";

const GLOBAL_TABS: { id: TdTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "umpires", label: "Umpires" },
];

const TOURNEY_TABS: { id: TdTab; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "teams", label: "Teams & Invites" },
  { id: "payments", label: "Payments" },
  { id: "pools", label: "Pools" },
  { id: "schedule", label: "Scheduling" },
  { id: "brackets", label: "Brackets" },
  { id: "messages", label: "Messages" },
];

export function TdShell() {
  const td = useTd();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {td.mode === "demo" && <DemoBanner />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy-900">Tournament Director</h1>
          <p className="text-sm text-slate-500">
            Manage tournaments, invitations, payments, pools, scheduling, umpires, and brackets.
          </p>
        </div>
        {td.selected && (
          <div className="flex items-center gap-2">
            <StatusPill status={td.selected.status} />
            <TournamentPicker />
          </div>
        )}
      </div>

      <nav className="no-print mt-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {GLOBAL_TABS.map((t) => (
          <TabButton key={t.id} id={t.id} label={t.label} />
        ))}
        <span className="mx-1 self-center text-slate-300">|</span>
        {TOURNEY_TABS.map((t) => (
          <TabButton key={t.id} id={t.id} label={t.label} disabled={!td.selected} />
        ))}
      </nav>

      <div className="mt-6">
        {td.loading ? (
          <div className="card p-10 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <ActiveView />
        )}
      </div>
    </div>
  );
}

function ActiveView() {
  const { tab, selected } = useTd();
  if (tab === "dashboard") return <DashboardView />;
  if (tab === "umpires") return <UmpiresView />;
  if (!selected) return <DashboardView />;
  switch (tab) {
    case "build":
      return <BuildView />;
    case "teams":
      return <TeamsView />;
    case "payments":
      return <PaymentsView />;
    case "pools":
      return <PoolsView />;
    case "schedule":
      return <ScheduleView />;
    case "brackets":
      return <BracketsView />;
    case "messages":
      return <MessagesView />;
    default:
      return <DashboardView />;
  }
}

function TabButton({ id, label, disabled }: { id: TdTab; label: string; disabled?: boolean }) {
  const { tab, setTab } = useTd();
  const active = tab === id;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function TournamentPicker() {
  const { tournaments, selectedId, select } = useTd();
  return (
    <select
      className="input w-auto"
      value={selectedId ?? ""}
      onChange={(e) => select(e.target.value || null)}
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function DemoBanner() {
  const { act, select } = useTd();
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    if (!confirm("Reset the demo to its original sample data? Anything you've created here will be cleared.")) return;
    setResetting(true);
    await act((p) => p.reset?.() ?? Promise.resolve());
    select(null);
    setResetting(false);
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-900">
        <span className="font-bold">Demo mode.</span> Nothing here is saved or sent — your changes live
        only in this browser tab. Team search returns <span className="font-semibold">real</span> clubs,
        but no team is actually invited or participating.
      </p>
      <button onClick={reset} disabled={resetting} className="btn-ghost shrink-0 disabled:opacity-50">
        {resetting ? "Resetting…" : "↺ Reset demo"}
      </button>
    </div>
  );
}
