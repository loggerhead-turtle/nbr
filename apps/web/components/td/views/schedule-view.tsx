"use client";

import { useMemo, useState } from "react";
import { AGE_GROUPS, FIELD_GRADES, formatClock, type FieldGrade } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { useTd } from "../lib/td-context";
import { divisionLabel, SectionTitle, EmptyCard } from "../lib/ui";
import { GAME_DURATIONS } from "../lib/types";
import { enumerateDays, isoDate } from "../lib/util";

const GRADE_TONE: Record<FieldGrade, string> = {
  Championship: "bg-violet-100 text-violet-700",
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-sky-100 text-sky-700",
  C: "bg-amber-100 text-amber-800",
  D: "bg-slate-100 text-slate-600",
};

function GradeBadge({ grade }: { grade: FieldGrade }) {
  return <span className={`badge ${GRADE_TONE[grade]}`}>{grade === "Championship" ? "Champ" : grade}</span>;
}

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
  const ordered = [...t.fields].sort((a, b) => FIELD_GRADES.indexOf(a.grade) - FIELD_GRADES.indexOf(b.grade));
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle
          title="Fields"
          sub="Grade, lights, eligible ages, and private notes."
          action={<button onClick={() => setAdding((v) => !v)} className="btn-ghost">{adding ? "Close" : "+ Add"}</button>}
        />
        {adding && <FieldForm onDone={() => setAdding(false)} />}
        <ul className="mt-2 space-y-2">
          {ordered.length === 0 && <li className="text-sm text-slate-500">No fields yet — add one above.</li>}
          {ordered.map((f) => (
            <FieldRow key={f.id} fieldId={f.id} />
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">
          Top pools and bracket finals are steered to the best-graded fields automatically.
        </p>
      </div>
    </div>
  );
}

function FieldForm({ fieldId, onDone }: { fieldId?: string; onDone: () => void }) {
  const { selected, act } = useTd();
  const t = selected!;
  const existing = t.fields.find((f) => f.id === fieldId);
  const [name, setName] = useState(existing?.name ?? "");
  const [grade, setGrade] = useState<FieldGrade>(existing?.grade ?? "B");
  const [hasLights, setHasLights] = useState(existing?.hasLights ?? false);
  const [ages, setAges] = useState<string[]>(existing?.allowedAgeGroups ?? []);
  const [notes, setNotes] = useState(existing?.privateNotes ?? "");

  const toggleAge = (a: string) => setAges((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const save = async () => {
    if (!name.trim()) return;
    const input = { name: name.trim(), grade, hasLights, allowedAgeGroups: ages, privateNotes: notes };
    if (fieldId) await act((p) => p.updateField(t.id, fieldId, input));
    else await act((p) => p.addField(t.id, input));
    onDone();
  };

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label text-[11px]">Field name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miller Park #1" />
        </div>
        <div className="w-32">
          <label className="label text-[11px]">Grade</label>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value as FieldGrade)}>
            {FIELD_GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

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
          <span className="flex items-center gap-2">
            <GradeBadge grade={f.grade} />
            <span className="font-medium text-navy-800">{f.name}</span>
          </span>
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

  const [form, setForm] = useState({
    startDate: isoDate(t.startDate) || isoDate(new Date().toISOString()),
    endDate: isoDate(t.endDate) || isoDate(t.startDate) || isoDate(new Date().toISOString()),
    dayStartTime: t.dayStartTime,
    gamesEndBy: t.gamesEndBy,
    sunsetTime: t.sunsetTime,
    gameDurationMinutes: t.gameDurationMinutes,
    poolPlayGames: t.poolPlayGames,
    poolPlayGamesPerDay: t.poolPlayGamesPerDay,
    allowCrossover: t.allowCrossover,
    bracketDayIndex: t.bracketDayIndex,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const days = useMemo(() => enumerateDays(form.startDate, form.endDate), [form.startDate, form.endDate]);
  const hasPools = t.divisions.some((d) => d.pools);

  const generate = async () => {
    setBusy(true);
    await act((p) =>
      p.buildSchedule(t.id, {
        poolPlayGames: form.poolPlayGames,
        poolPlayGamesPerDay: form.poolPlayGamesPerDay,
        allowCrossover: form.allowCrossover,
        startDate: form.startDate,
        endDate: form.endDate,
        dayStartTime: form.dayStartTime,
        gamesEndBy: form.gamesEndBy,
        sunsetTime: form.sunsetTime,
        gameDurationMinutes: form.gameDurationMinutes,
        bracketDayIndex: Math.min(form.bracketDayIndex, days.length - 1),
      }),
    );
    setBusy(false);
  };

  const ageOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of t.divisions) m.set(d.id, d.ageGroup);
    return m;
  }, [t.divisions]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle title="Schedule settings" sub="Set the days, times, and game length, then generate." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First day">
            <input type="date" className="input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="Last day">
            <input type="date" className="input" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
          <Field label="Day start time">
            <input type="time" className="input" value={form.dayStartTime} onChange={(e) => set("dayStartTime", e.target.value)} />
          </Field>
          <Field label="Games must end by">
            <input type="time" className="input" value={form.gamesEndBy} onChange={(e) => set("gamesEndBy", e.target.value)} />
          </Field>
          <Field label="Sunset (no-light fields finish by)">
            <input type="time" className="input" value={form.sunsetTime} onChange={(e) => set("sunsetTime", e.target.value)} />
          </Field>
          <Field label="Game time limit">
            <select className="input" value={form.gameDurationMinutes} onChange={(e) => set("gameDurationMinutes", Number(e.target.value))}>
              {GAME_DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Pool games / team / day">
            <select className="input" value={form.poolPlayGamesPerDay} onChange={(e) => set("poolPlayGamesPerDay", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Pool games / team (total)">
            <select className="input" value={form.poolPlayGames} onChange={(e) => set("poolPlayGames", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Bracket day">
            <select className="input" value={Math.min(form.bracketDayIndex, days.length - 1)} onChange={(e) => set("bracketDayIndex", Number(e.target.value))}>
              {days.map((d, i) => (
                <option key={d} value={i}>Day {i + 1} ({new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</option>
              ))}
            </select>
          </Field>
          <Field label="Crossover games">
            <label className="flex h-9 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.allowCrossover} onChange={(e) => set("allowCrossover", e.target.checked)} />
              Allow cross-pool games
            </label>
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={generate} disabled={busy || !hasPools} className="btn-accent disabled:opacity-50">
            {busy ? "Scheduling…" : "⚡ Generate schedule"}
          </button>
          {!hasPools && <p className="text-sm text-amber-700">Generate pools first (Pools tab), then schedule.</p>}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Brackets land on the chosen day with finals on the Championship field. How many teams reach the
          bracket is set per division in the Brackets tab.
        </p>
      </div>

      {t.schedule.length === 0 ? (
        <EmptyCard icon="🗓️" title="No games scheduled yet" sub="Set the options above and generate — teams auto-assign to fields by grade and time." />
      ) : (
        days.map((date, dayIndex) => {
          const dayGames = t.schedule
            .filter((g) => g.dayIndex === dayIndex)
            .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
          if (dayGames.length === 0) return null;
          return (
            <div key={date} className="card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 font-bold text-navy-900">
                Day {dayIndex + 1} · {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                <span className="ml-2 text-sm font-normal text-slate-500">{dayGames.length} games</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Field</th>
                    <th className="px-4 py-2">Round / Pool</th>
                    <th className="px-4 py-2">Matchup</th>
                    <th className="px-4 py-2">Umpire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayGames.map((g) => {
                    const age = ageOf.get(g.divisionId) ?? "";
                    const eligibleUmps = umpires.filter((u) => u.ageGroups.includes(age));
                    return (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 tabular-nums text-slate-600">{g.startMinutes != null ? formatClock(g.startMinutes) : "—"}</td>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-1.5">
                            {g.fieldGrade && <GradeBadge grade={g.fieldGrade} />}
                            <span className="text-slate-600">{g.fieldName ?? "—"}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {g.kind === "bracket" ? (
                            <span className="badge bg-violet-100 text-violet-700">{g.roundName}</span>
                          ) : g.isCrossover ? (
                            <span className="badge bg-amber-100 text-amber-800">crossover</span>
                          ) : (
                            <span className="text-slate-500">{g.poolLabel}</span>
                          )}
                          <span className="ml-1.5 text-[11px] text-slate-400">{ageGroupLabel(age)}</span>
                        </td>
                        <td className="px-4 py-2 font-medium text-navy-800">
                          {g.homeTeamName} <span className="text-slate-400">vs</span> {g.awayTeamName}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label text-[11px]">{label}</label>
      {children}
    </div>
  );
}
