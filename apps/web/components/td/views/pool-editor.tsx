"use client";

import { useState } from "react";
import type { PoolResult, SeededTeam } from "@nbr/core";
import { formatRating } from "@/lib/format";

/**
 * Drag-and-drop pool editor. Teams carry a grip handle and can be dragged from
 * one pool into another; each pool's average NBR updates live. Nothing is
 * persisted until the director clicks Save.
 */
export function PoolEditor({
  result,
  onSave,
  onCancel,
}: {
  result: PoolResult;
  onSave: (cols: SeededTeam[][]) => void;
  onCancel: () => void;
}) {
  const [cols, setCols] = useState<SeededTeam[][]>(() => result.pools.map((p) => [...p.teams]));
  const [drag, setDrag] = useState<{ col: number; idx: number } | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);

  const avg = (c: SeededTeam[]) => (c.length ? c.reduce((s, t) => s + t.rating, 0) / c.length : 0);

  const drop = (toCol: number) => {
    if (!drag) return;
    if (drag.col !== toCol) {
      setCols((prev) => {
        const next = prev.map((c) => [...c]);
        const [team] = next[drag.col]!.splice(drag.idx, 1);
        if (team) next[toCol]!.push(team);
        return next;
      });
    }
    setDrag(null);
    setOverCol(null);
  };

  return (
    <div className="no-print">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Drag teams between pools using the <span className="font-semibold">☰</span> handle — averages
          update live. Nothing is saved until you click Save.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={() => onSave(cols)} className="btn-primary">Save pools</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cols.map((col, ci) => (
          <div
            key={ci}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(ci);
            }}
            onDragLeave={() => setOverCol((c) => (c === ci ? null : c))}
            onDrop={() => drop(ci)}
            className={`card overflow-hidden transition ${overCol === ci ? "ring-2 ring-navy-400" : ""}`}
          >
            <div className="flex items-center justify-between bg-navy-900 px-4 py-2.5 text-white">
              <span className="font-bold">{result.pools[ci]?.label ?? `Pool ${ci + 1}`}</span>
              <span className="text-xs text-navy-100">
                Avg <span className="font-semibold tabular-nums">{formatRating(avg(col))}</span> · {col.length} team{col.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="min-h-[64px] divide-y divide-slate-100">
              {col.map((t, ti) => {
                const dragging = drag?.col === ci && drag?.idx === ti;
                return (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={() => setDrag({ col: ci, idx: ti })}
                    onDragEnd={() => {
                      setDrag(null);
                      setOverCol(null);
                    }}
                    className={`flex cursor-grab items-center justify-between gap-2 px-3 py-2 text-sm active:cursor-grabbing ${
                      dragging ? "opacity-40" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="select-none text-base leading-none text-slate-400" aria-hidden>☰</span>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {t.seed}
                      </span>
                      <span className="font-medium text-slate-800">{t.name}</span>
                    </span>
                    <span className="tabular-nums font-semibold text-navy-800">{formatRating(t.rating)}</span>
                  </li>
                );
              })}
              {col.length === 0 && (
                <li className="px-3 py-5 text-center text-xs text-slate-400">Drop teams here</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
