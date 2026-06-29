"use client";

import { useState } from "react";
import { AGE_GROUPS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { useTd } from "../lib/td-context";
import { SectionTitle } from "../lib/ui";

export function UmpiresView() {
  const { umpires } = useTd();
  const [registering, setRegistering] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Umpires register and set their own availability and age groups (they can also opt in to scrimmages).
        Accepting an assignment marks them unavailable. Evaluation notes below are <span className="font-semibold text-navy-800">private to you</span>.
      </div>

      <SectionTitle
        title="Umpire crew"
        sub={`${umpires.filter((u) => u.available).length} of ${umpires.length} available`}
        action={<button onClick={() => setRegistering((v) => !v)} className="btn-accent">{registering ? "Close" : "+ Register umpire"}</button>}
      />

      {registering && <RegisterForm onDone={() => setRegistering(false)} />}

      <div className="grid gap-3 lg:grid-cols-2">
        {umpires.map((u) => (
          <UmpireCard key={u.id} umpireId={u.id} />
        ))}
      </div>
    </div>
  );
}

function UmpireCard({ umpireId }: { umpireId: string }) {
  const { umpires, act } = useTd();
  const u = umpires.find((x) => x.id === umpireId)!;
  const [note, setNote] = useState("");

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-bold text-navy-900">{u.name}</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={u.available ? "badge bg-emerald-100 text-emerald-700" : "badge bg-slate-200 text-slate-600"}>
              {u.available ? "available" : "unavailable"}
            </span>
            {u.willUmpireScrimmages && <span className="badge bg-sky-100 text-sky-700">scrimmages</span>}
            <span className="text-slate-400">{u.ageGroups.map(ageGroupLabel).join(", ") || "no ages set"}</span>
          </div>
        </div>
        <button onClick={() => act((p) => p.toggleUmpireAvailable(u.id))} className="btn-ghost text-xs">
          Mark {u.available ? "unavailable" : "available"}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🔒 Private notes</p>
        {u.notes.length > 0 && (
          <ul className="mt-1 space-y-1">
            {u.notes.map((n) => (
              <li key={n.id} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{n.body}</li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 flex gap-2">
          <input
            className="input text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add an evaluation note…"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && note.trim()) {
                await act((p) => p.addUmpireNote(u.id, note.trim()));
                setNote("");
              }
            }}
          />
          <button
            onClick={async () => {
              if (!note.trim()) return;
              await act((p) => p.addUmpireNote(u.id, note.trim()));
              setNote("");
            }}
            className="btn-ghost"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const { act } = useTd();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ages, setAges] = useState<string[]>([]);
  const [scrim, setScrim] = useState(false);
  const toggleAge = (a: string) => setAges((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const submit = async () => {
    if (!name.trim()) return;
    await act((p) => p.registerUmpire({ name: name.trim(), email: email.trim() || null, ageGroups: ages, willUmpireScrimmages: scrim }));
    onDone();
  };

  return (
    <div className="card p-4">
      <p className="mb-2 text-sm font-semibold text-navy-900">Umpire self-registration</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label text-[11px]">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label text-[11px]">Email (optional)</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <p className="label mt-2 text-[11px]">Age groups I’ll umpire</p>
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
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={scrim} onChange={(e) => setScrim(e.target.checked)} />
        Available for scrimmages too
      </label>
      <div className="mt-3 flex gap-2">
        <button onClick={submit} className="btn-primary">Register</button>
        <button onClick={onDone} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

