"use client";

import { useState } from "react";
import type { BracketResult } from "@nbr/core";
import { useTd } from "../lib/td-context";
import { divisionLabel, SectionTitle, EmptyCard } from "../lib/ui";
import { ADVANCEMENT_PRESETS } from "../lib/advancement-presets";
import type { TdAdvancementRule } from "../lib/types";

export function BracketsView() {
  const { selected } = useTd();
  if (!selected) return null;
  const t = selected;
  if (t.divisions.length === 0) {
    return <EmptyCard icon="🥇" title="No divisions yet" sub="Add divisions and generate pools, then build brackets here." />;
  }
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Choose how teams advance out of pool play, or write your own rule. Build the bracket once pools exist.
      </div>
      {t.divisions.map((d) => (
        <DivisionBracket key={d.id} divisionId={d.id} />
      ))}
    </div>
  );
}

function DivisionBracket({ divisionId }: { divisionId: string }) {
  const { selected, act } = useTd();
  const t = selected!;
  const div = t.divisions.find((d) => d.id === divisionId)!;
  const rule = t.advancementRules[divisionId] ?? null;
  const [showRules, setShowRules] = useState(!rule);
  const [busy, setBusy] = useState(false);

  const pickPreset = async (r: TdAdvancementRule) => {
    await act((p) => p.setAdvancementRule(t.id, div.id, r));
    setShowRules(false);
  };

  const build = async () => {
    setBusy(true);
    await act((p) => p.buildBracket(t.id, div.id));
    setBusy(false);
  };

  return (
    <div className="card p-4">
      <SectionTitle
        title={divisionLabel(div)}
        sub={rule ? `Rule: ${rule.name}` : "No advancement rule chosen yet."}
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowRules((v) => !v)} className="btn-ghost">{showRules ? "Close rules" : "Advancement rules"}</button>
            {rule && div.pools && (
              <button onClick={build} disabled={busy} className="btn-accent disabled:opacity-50">
                {busy ? "Building…" : div.bracket ? "Rebuild bracket" : "Build bracket"}
              </button>
            )}
          </div>
        }
      />

      {!div.pools && <p className="text-sm text-amber-700">Generate pools first (Pools tab) to seed a bracket.</p>}

      {showRules && (
        <div className="mb-4 space-y-2">
          <div className="grid gap-2 md:grid-cols-3">
            {ADVANCEMENT_PRESETS.map((r) => (
              <button
                key={r.presetKey}
                onClick={() => pickPreset(r)}
                className={`rounded-lg border p-3 text-left text-sm transition hover:border-navy-300 ${
                  rule?.presetKey === r.presetKey ? "border-navy-400 bg-navy-50" : "border-slate-200"
                }`}
              >
                <p className="font-semibold text-navy-900">{r.name}</p>
                <p className="mt-1 text-xs text-slate-500">{r.synopsis}</p>
              </button>
            ))}
          </div>
          <CustomRuleForm onSave={pickPreset} current={rule} />
        </div>
      )}

      {div.bracket ? (
        <BracketView bracket={div.bracket} />
      ) : (
        rule && div.pools && <p className="text-sm text-slate-500">Bracket not built yet — click “Build bracket”.</p>
      )}
    </div>
  );
}

function CustomRuleForm({ onSave, current }: { onSave: (r: TdAdvancementRule) => void; current: TdAdvancementRule | null }) {
  const [open, setOpen] = useState(false);
  const [winners, setWinners] = useState(current?.isCustom ? current.poolWinnersAdvance : 1);
  const [wildcards, setWildcards] = useState(current?.isCustom ? current.wildcards : 0);
  const [seedBy, setSeedBy] = useState<TdAdvancementRule["seedBy"]>(current?.isCustom ? current.seedBy : "POOL_RECORD");
  const [reseed, setReseed] = useState(current?.isCustom ? current.reseed : true);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-navy-700 hover:underline">
        + Write a custom advancement rule
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-semibold text-navy-900">Custom advancement rule</p>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label text-[11px]">Top-N per pool</label>
          <input type="number" min={1} max={99} value={winners} onChange={(e) => setWinners(Math.max(1, Number(e.target.value) || 1))} className="input w-24" />
        </div>
        <div>
          <label className="label text-[11px]">Wildcards</label>
          <input type="number" min={0} max={16} value={wildcards} onChange={(e) => setWildcards(Math.max(0, Number(e.target.value) || 0))} className="input w-24" />
        </div>
        <div>
          <label className="label text-[11px]">Seed by</label>
          <select className="input" value={seedBy} onChange={(e) => setSeedBy(e.target.value as TdAdvancementRule["seedBy"])}>
            <option value="POOL_RECORD">Pool record</option>
            <option value="RATING">NBR rating</option>
            <option value="RUN_DIFF">Run differential</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={reseed} onChange={(e) => setReseed(e.target.checked)} />
          Reseed 1..N
        </label>
      </div>
      <button
        onClick={() =>
          onSave({
            presetKey: null,
            name: "Custom rule",
            synopsis: `Top ${winners} per pool${wildcards ? ` + ${wildcards} wildcard${wildcards === 1 ? "" : "s"}` : ""}, seeded by ${seedBy.toLowerCase().replace("_", " ")}${reseed ? ", reseeded" : ""}.`,
            poolWinnersAdvance: winners,
            wildcards,
            seedBy,
            reseed,
            isCustom: true,
          })
        }
        className="btn-primary mt-2"
      >
        Use custom rule
      </button>
    </div>
  );
}

function BracketView({ bracket }: { bracket: BracketResult }) {
  if (bracket.qualifiers.length < 2) return <p className="text-sm text-slate-500">Not enough qualifiers for a bracket.</p>;
  return (
    <div>
      <p className="mb-2 text-sm text-slate-500">
        {bracket.qualifiers.length} qualifiers · bracket of {bracket.bracketSize}
        {bracket.byes > 0 ? ` · ${bracket.byes} bye${bracket.byes === 1 ? "" : "s"}` : ""}
      </p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {bracket.rounds.map((round, ri) => (
          <div key={ri} className="min-w-[200px] flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{round.name}</p>
            <div className="space-y-2">
              {round.matchups.map((m) => (
                <div key={m.matchId} className="card p-2 text-sm">
                  <Slot seed={m.home.seed} name={m.home.team?.name ?? null} pool={m.home.team?.poolLabel} />
                  <div className="my-1 border-t border-dashed border-slate-200" />
                  <Slot seed={m.away.seed} name={m.away.team?.name ?? null} pool={m.away.team?.poolLabel} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slot({ seed, name, pool }: { seed: number; name: string | null; pool?: string }) {
  if (name === null && seed === 0) return <div className="flex items-center gap-2 text-slate-400"><Seed n={null} /> <span>TBD</span></div>;
  if (name === null) return <div className="flex items-center gap-2 text-slate-400"><Seed n={seed} /> <span className="italic">BYE</span></div>;
  return (
    <div className="flex items-center gap-2">
      <Seed n={seed} />
      <span className="font-medium text-navy-800">{name}</span>
      {pool && <span className="text-[11px] text-slate-400">{pool}</span>}
    </div>
  );
}

function Seed({ n }: { n: number | null }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
      {n ?? "·"}
    </span>
  );
}
