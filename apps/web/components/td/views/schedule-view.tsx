"use client";

import { useState } from "react";
import { AGE_GROUPS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { useTd } from "../lib/td-context";
import { divisionLabel, SectionTitle, EmptyCard } from "../lib/ui";

export function ScheduleView() {
  const { selected } = useTd();
  if (!selected) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <FieldsPanel />
      <SchedulePanel />
    </div>
  );
}

function FieldsPanel() {
  const { selected } = useTd();
  const t = selected!;
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle title="Fields" sub="Lights, eligible ages, and private notes." action={<button onClick={() => setAdding((v) => !v)} className="btn-ghost">{adding ? "Close" : "+ Add"}</button>} />
        {adding && <FieldForm onDone={() => setAdding(false)} />}
        <ul className="mt-2 space-y-2">
          {t.fields.length === 0 && <li className="text-sm text-slate-500">No fields yet — add one above.</li>}
          {t.fields.map((f) => (
            <FieldRow key={f.id} fieldId={f.id} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function FieldForm({ fieldId, onDone }: { fieldId?: string; onDone: () => void }) {
  const { selected, act } = useTd();
  const t = selected!;
  const existing = t.fields.find((f) => f.id === fieldId);
  const [name, setName] = useState(existing?.name ?? "");
  const [hasLights, setHasLights] = useState(existing?.hasLights ?? false);
  const [ages, setAges] = useState<string[]>(existing?.allowedAgeGroups ?? []);
  const [notes, setNotes] = useState(existing?.privateNotes ?? "");

  const toggleAge = (a: string) => setAges((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const save = async () => {
    if (!name.trim()) return;
    const input = { name: name.trim(), hasLights, allowedAgeGroups: ages, privateNotes: notes };
    if (fieldId) await act((p) => p.updateField(t.id, fieldId, input));
    else await act((p) => p.addField(t.id, input));
    onDone();
  };

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-3">
      <label className="label text-[11px]">Field name</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miller Park #1" />

      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={hasLights} onChange={(e) => setHasLights(e.target.checked)} />
        Has usable lights (evening games)
      </label>

      <p className="label mt-2 text-[11px]">Age groups this field can host</p>
      <div className="flex flex-wrap gap-1">
        {AGE_GROUPS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggleAge(a)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${ages.includes(a) ? "bg-navy-800 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}
          >
            {ageGroupLabel(a)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Leave blank to allow any age.</p>

      <label className="label mt-2 text-[11px]">Private notes (TD only)</label>
      <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate codes, groundskeeper contact, restrictions…" />

      <div className="mt-2 flex gap-2">
        <button onClick={save} className="btn-primary flex-1">Save field</button>
        <button onClick={onDone} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function FieldRow({ fieldId }: { fieldId: string }) {
  const { selected, act } = useTd();
  const t = selected!;
  const f = t.fields.find((x) => x.id === fieldId)!;
  const [editing, setEditing] = useState(false);
  if (editing) return <FieldForm fieldId={fieldId} onDone={() => setEditing(false)} />;
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-medium text-navy-800">{f.name}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={f.hasLights ? "badge bg-amber-100 text-amber-800" : "badge bg-slate-100 text-slate-500"}>
              {f.hasLights ? "💡 lights" : "no lights"}
            </span>
            <span className="text-slate-400">
              {f.allowedAgeGroups.length ? f.allowedAgeGroups.map(ageGroupLabel).join(", ") : "any age"}
            </span>
          </div>
          {f.privateNotes && <p className="mt-1 text-xs italic text-slate-500">🔒 {f.privateNotes}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className="text-xs text-navy-600 hover:underline">Edit</button>
          <button onClick={() => act((p) => p.removeField(t.id, f.id))} className="text-xs text-slate-400 hover:text-rose-600">Remove</button>
        </div>
      </div>
    </li>
  );
}

function SchedulePanel() {
  const { selected, act, umpires } = useTd();
  const t = selected!;
  const [games, setGames] = useState(t.poolPlayGames);
  const [crossover, setCrossover] = useState(t.allowCrossover);
  const [busy, setBusy] = useState(false);

  const hasPools = t.divisions.some((d) => d.pools);
  const generate = async () => {
    setBusy(true);
    await act((p) => p.buildSchedule(t.id, { poolPlayGames: games, allowCrossover: crossover }));
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle title="Generate schedule" sub="Teams only play within their pool unless crossover is allowed." />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label text-[11px]">Pool-play games / team</label>
            <input type="number" min={1} max={10} value={games} onChange={(e) => setGames(Math.max(1, Number(e.target.value) || 1))} className="input w-24" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={crossover} onChange={(e) => setCrossover(e.target.checked)} />
            Allow crossover (cross-pool) games
          </label>
          <button onClick={generate} disabled={busy || !hasPools} className="btn-accent disabled:opacity-50">
            {busy ? "Scheduling…" : "⚡ Generate schedule"}
          </button>
        </div>
        {!hasPools && <p className="mt-2 text-sm text-amber-700">Generate pools first (Pools tab), then schedule.</p>}
      </div>

      {t.schedule.length === 0 ? (
        <EmptyCard icon="🗓️" title="No games scheduled yet" sub="Set games per team and generate — only same-pool matchups unless crossover is on." />
      ) : (
        t.divisions.map((d) => {
          const divGames = t.schedule.filter((g) => g.divisionId === d.id);
          if (divGames.length === 0) return null;
          const eligibleUmps = umpires.filter((u) => u.ageGroups.includes(d.ageGroup));
          return (
            <div key={d.id} className="card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 font-bold text-navy-900">
                {divisionLabel(d)} <span className="text-sm font-normal text-slate-500">· {divGames.length} games</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Slot</th>
                    <th className="px-4 py-2">Field</th>
                    <th className="px-4 py-2">Pool</th>
                    <th className="px-4 py-2">Matchup</th>
                    <th className="px-4 py-2">Umpire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divGames.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600">{g.slotLabel}</td>
                      <td className="px-4 py-2 text-slate-600">{g.fieldName ?? "—"}</td>
                      <td className="px-4 py-2">
                        {g.isCrossover ? <span className="badge bg-violet-100 text-violet-700">crossover</span> : <span className="text-slate-500">{g.poolLabel}</span>}
                      </td>
                      <td className="px-4 py-2 font-medium text-navy-800">{g.homeTeamName} <span className="text-slate-400">vs</span> {g.awayTeamName}</td>
                      <td className="px-4 py-2">
                        <select
                          className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                          value={g.umpireId ?? ""}
                          onChange={(e) => act((p) => p.assignUmpire(t.id, g.id, e.target.value || null))}
                        >
                          <option value="">Unassigned</option>
                          {eligibleUmps.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}{!u.available && u.id !== g.umpireId ? " (busy)" : ""}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
