"use client";

import { useState } from "react";
import { PoolResultView } from "@/components/pool-result";
import { formatRating } from "@/lib/format";
import { PoolEditor } from "./pool-editor";
import { useTd } from "../lib/td-context";
import { divisionLabel, SectionTitle, EmptyCard, divisionTeamCount } from "../lib/ui";

export function PoolsView() {
  const { selected } = useTd();
  if (!selected) return null;
  const t = selected;

  if (t.divisions.length === 0) {
    return <EmptyCard icon="🏆" title="No divisions yet" sub="Add divisions and teams first — then generate pools with one click." />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        One click builds <span className="font-semibold text-navy-800">balanced</span> pools per division —
        snake-seeded by NBR so the strongest teams are split fairly. Regenerate any time before scheduling.
      </div>
      {t.divisions.map((d) => (
        <DivisionPools key={d.id} divisionId={d.id} />
      ))}
    </div>
  );
}

function DivisionPools({ divisionId }: { divisionId: string }) {
  const { selected, act } = useTd();
  const t = selected!;
  const div = t.divisions.find((d) => d.id === divisionId)!;
  const teamCount = divisionTeamCount(t, div);
  const suggested = Math.min(Math.max(2, Math.floor(teamCount / 3)), Math.max(2, teamCount));
  const [numPools, setNumPools] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const generate = async () => {
    setBusy(true);
    await act((p) => p.generatePools(t.id, div.id, numPools));
    setEditing(false);
    setBusy(false);
  };

  return (
    <div className="card p-4">
      <SectionTitle
        title={divisionLabel(div)}
        sub={`${teamCount} team${teamCount === 1 ? "" : "s"}`}
        action={
          editing ? null : teamCount >= 2 ? (
            <div className="flex items-end gap-2">
              <div>
                <label className="label text-[11px]">Pools</label>
                <select
                  value={numPools}
                  onChange={(e) => setNumPools(Number(e.target.value))}
                  className="input w-20"
                >
                  {Array.from({ length: Math.max(1, teamCount - 1) }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <button onClick={generate} disabled={busy} className="btn-accent disabled:opacity-50">
                {busy ? "Generating…" : div.pools ? "Regenerate" : "Generate pools"}
              </button>
              {div.pools && (
                <button onClick={() => setEditing(true)} className="btn-ghost">✏️ Edit</button>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400">Add at least 2 teams</span>
          )
        }
      />
      {editing && div.pools ? (
        <PoolEditor
          result={div.pools}
          onCancel={() => setEditing(false)}
          onSave={async (cols) => {
            await act((p) => p.setDivisionPools(t.id, div.id, cols));
            setEditing(false);
          }}
        />
      ) : div.pools ? (
        <PoolResultView result={div.pools} name={`${t.name} — ${divisionLabel(div)}`} formatValue={formatRating} />
      ) : (
        <p className="text-sm text-slate-500">No pools yet for this division.</p>
      )}
    </div>
  );
}
