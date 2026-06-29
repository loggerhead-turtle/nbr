"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTd } from "../lib/td-context";
import type { TdTeamRef } from "../lib/types";

/**
 * Debounced real-team search (proxied to /api/teams/search). Pre-fills the NBR
 * band + age group from the division being built, but the director can override.
 */
export function TeamSearch({
  defaultAge,
  defaultNbrMin,
  defaultNbrMax,
  excludeIds,
  onPick,
  pickLabel = "Invite",
}: {
  defaultAge?: string;
  defaultNbrMin?: number | null;
  defaultNbrMax?: number | null;
  excludeIds: Set<string>;
  onPick: (team: TdTeamRef) => void;
  pickLabel?: string;
}) {
  const { port } = useTd();
  const [q, setQ] = useState("");
  const [nbrMin, setNbrMin] = useState(defaultNbrMin != null ? String(defaultNbrMin) : "");
  const [nbrMax, setNbrMax] = useState(defaultNbrMax != null ? String(defaultNbrMax) : "");
  const [near, setNear] = useState("");
  const [hits, setHits] = useState<TdTeamRef[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const hasRange = nbrMin.trim() !== "" || nbrMax.trim() !== "";
    if (q.trim().length < 2 && !hasRange) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const teams = await port.searchTeams({
          q: q.trim() || undefined,
          nbrMin: nbrMin.trim() ? Number(nbrMin) : undefined,
          nbrMax: nbrMax.trim() ? Number(nbrMax) : undefined,
          age: defaultAge,
          near: near.trim() || undefined,
        });
        setHits(teams);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [q, nbrMin, nbrMax, near, defaultAge, port]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div>
      <label className="label" htmlFor="ts-q">Find teams to invite</label>
      <input
        id="ts-q"
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search team name…"
        autoComplete="off"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="w-24">
          <label className="label text-[11px]">Min NBR</label>
          <input className="input" value={nbrMin} onChange={(e) => setNbrMin(e.target.value)} inputMode="numeric" placeholder="any" />
        </div>
        <div className="w-24">
          <label className="label text-[11px]">Max NBR</label>
          <input className="input" value={nbrMax} onChange={(e) => setNbrMax(e.target.value)} inputMode="numeric" placeholder="any" />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="label text-[11px]">Near (city)</label>
          <input className="input" value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. Provo" autoComplete="off" />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Search by name and/or an NBR range{defaultAge ? ` within ${defaultAge.replace("U", "") + "U"}` : ""}. Add a city to sort by distance.
      </p>

      {searching && <p className="mt-2 text-xs text-slate-400">Searching real teams…</p>}
      {hits.length > 0 && (
        <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {hits.map((h) => {
            const already = excludeIds.has(h.id);
            return (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-800">{h.name}</span>
                  {h.city && <span className="text-xs text-slate-400">{h.city}, {h.state}</span>}
                  {h.nbr != null && <span className="tabular-nums font-semibold text-navy-700">{h.nbr} NBR</span>}
                  {h.distanceMiles != null && <span className="text-xs text-slate-400">~{h.distanceMiles} mi</span>}
                </span>
                {already ? (
                  <span className="badge bg-slate-200 text-slate-600">invited</span>
                ) : (
                  <button onClick={() => onPick(h)} className="btn-ghost">{pickLabel}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
