"use client";

import { useState } from "react";
import { AGE_GROUPS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { useTd } from "../lib/td-context";
import { divisionLabel, SectionTitle } from "../lib/ui";
import { money } from "../lib/util";
import { TeamSearch } from "./team-search";

const NBR_LEVELS = ["NBR I", "NBR II", "NBR III"];

export function BuildView() {
  const { selected, act, setTab } = useTd();
  const [activeDiv, setActiveDiv] = useState<string | null>(null);
  if (!selected) return null;
  const t = selected;

  const addDivision = async (input: { ageGroup: string; nbrLevel: string; nbrMin: number | null; nbrMax: number | null }) => {
    const d = await act((p) => p.addDivision(t.id, input));
    setActiveDiv(d.id);
  };

  const active = t.divisions.find((d) => d.id === activeDiv) ?? null;
  const excludeIds = new Set(t.invites.filter((i) => active && i.divisionId === active.id).map((i) => i.team.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <TournamentSettings />

        <div className="card p-4">
          <SectionTitle title="Divisions" sub="Add age groups up front, or one at a time as you go." />
          <AddDivisionForm existing={t.divisions} onAdd={addDivision} />
          <ul className="mt-3 space-y-1.5">
            {t.divisions.length === 0 && (
              <li className="text-sm text-slate-500">No divisions yet — add your first age group above.</li>
            )}
            {t.divisions.map((d) => {
              const count = t.invites.filter((i) => i.divisionId === d.id).length;
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setActiveDiv(d.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      active?.id === d.id ? "border-navy-400 bg-navy-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium text-navy-800">{divisionLabel(d)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{count} team{count === 1 ? "" : "s"}</span>
                      <span
                        className="text-slate-300 hover:text-rose-500"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Remove ${divisionLabel(d)} and its teams?`)) {
                            await act((p) => p.removeDivision(t.id, d.id));
                            if (active?.id === d.id) setActiveDiv(null);
                          }
                        }}
                      >
                        ✕
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {t.invites.length > 0 && (
            <button onClick={() => setTab("pools")} className="btn-primary mt-4 w-full">
              Continue to pools →
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {active ? (
          <div className="card p-4">
            <SectionTitle
              title={`Add teams · ${divisionLabel(active)}`}
              sub={
                active.nbrMin || active.nbrMax
                  ? `Targeting NBR ${active.nbrMin ?? "any"}–${active.nbrMax ?? "any"}.`
                  : "Search returns real teams. Add as many as you like, then move to the next division."
              }
            />
            <TeamSearch
              defaultAge={active.ageGroup}
              defaultNbrMin={active.nbrMin}
              defaultNbrMax={active.nbrMax}
              excludeIds={excludeIds}
              onPick={(team) => act((p) => p.invite(t.id, active.id, team))}
            />
            <DivisionRoster divisionId={active.id} />
          </div>
        ) : (
          <div className="card flex min-h-[260px] items-center justify-center p-8 text-center">
            <div>
              <p className="text-3xl">🏟️</p>
              <p className="mt-2 font-semibold text-navy-900">Pick or add a division</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                Select a division on the left to search and add teams. You can run two divisions of the
                same age at different NBR levels.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentSettings() {
  const { selected, act } = useTd();
  const t = selected!;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: t.name,
    location: t.location ?? "",
    entryFee: t.entryFee != null ? String(t.entryFee) : "",
    depositAmount: t.depositAmount != null ? String(t.depositAmount) : "",
  });
  const save = async () => {
    await act((p) =>
      p.updateTournament(t.id, {
        name: form.name.trim() || t.name,
        location: form.location.trim() || null,
        entryFee: form.entryFee ? Number(form.entryFee) : null,
        depositAmount: form.depositAmount ? Number(form.depositAmount) : null,
      }),
    );
    setOpen(false);
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-navy-900">{t.name}</h3>
          <p className="text-xs text-slate-500">
            {t.location ?? "Location TBD"} · Entry {money(t.entryFee)} · Deposit {money(t.depositAmount)}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost">{open ? "Close" : "Edit"}</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Entry fee ($)</label>
              <input className="input" inputMode="numeric" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="label">Deposit ($)</label>
              <input className="input" inputMode="numeric" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} />
            </div>
          </div>
          <button onClick={save} className="btn-primary w-full">Save</button>
        </div>
      )}
    </div>
  );
}

function AddDivisionForm({
  existing,
  onAdd,
}: {
  existing: { ageGroup: string; nbrLevel: string }[];
  onAdd: (input: { ageGroup: string; nbrLevel: string; nbrMin: number | null; nbrMax: number | null }) => void;
}) {
  const [ageGroup, setAgeGroup] = useState("U12");
  const [nbrLevel, setNbrLevel] = useState("NBR I");
  const [nbrMin, setNbrMin] = useState("");
  const [nbrMax, setNbrMax] = useState("");

  const dup = existing.some((d) => d.ageGroup === ageGroup && d.nbrLevel === nbrLevel);

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label text-[11px]">Age group</label>
          <select className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>{ageGroupLabel(a)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label text-[11px]">NBR level</label>
          <select className="input" value={nbrLevel} onChange={(e) => setNbrLevel(e.target.value)}>
            {NBR_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="flex-1">
          <label className="label text-[11px]">NBR min (optional)</label>
          <input className="input" inputMode="numeric" value={nbrMin} onChange={(e) => setNbrMin(e.target.value)} placeholder="any" />
        </div>
        <div className="flex-1">
          <label className="label text-[11px]">NBR max (optional)</label>
          <input className="input" inputMode="numeric" value={nbrMax} onChange={(e) => setNbrMax(e.target.value)} placeholder="any" />
        </div>
      </div>
      <button
        disabled={dup}
        onClick={() =>
          onAdd({ ageGroup, nbrLevel, nbrMin: nbrMin ? Number(nbrMin) : null, nbrMax: nbrMax ? Number(nbrMax) : null })
        }
        className="btn-ghost mt-2 w-full disabled:opacity-50"
      >
        {dup ? "Already added" : "+ Add division"}
      </button>
      <p className="mt-1 text-[11px] text-slate-400">
        Tip: add the same age twice at different NBR levels to run two skill brackets at once.
      </p>
    </div>
  );
}

function DivisionRoster({ divisionId }: { divisionId: string }) {
  const { selected, act } = useTd();
  const t = selected!;
  const roster = t.invites.filter((i) => i.divisionId === divisionId);
  if (roster.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        In this division ({roster.length})
      </p>
      <ul className="flex flex-wrap gap-2">
        {roster
          .slice()
          .sort((a, b) => (b.team.nbr ?? 0) - (a.team.nbr ?? 0))
          .map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm">
              <span className="font-medium text-slate-700">{i.team.name}</span>
              {i.team.nbr != null && <span className="tabular-nums text-xs text-navy-700">{i.team.nbr}</span>}
              <button
                onClick={() => act((p) => p.removeInvite(t.id, i.id))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${i.team.name}`}
              >
                ×
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
