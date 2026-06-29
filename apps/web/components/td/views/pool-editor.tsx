"use client";

import { useRef, useState } from "react";
import type { PoolResult, SeededTeam } from "@nbr/core";
import { formatRating } from "@/lib/format";

/**
 * Drag-and-drop pool editor. Teams carry a grip handle and can be dragged from
 * one pool into another; each pool's average NBR updates live. Built on Pointer
 * Events so it works with both mouse and touch (the grip uses touch-action:none
 * so dragging on a phone doesn't scroll the page). Nothing is persisted until
 * the director clicks Save.
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
  const [overCol, setOverCol] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string } | null>(null);

  const dragRef = useRef<{ col: number; idx: number } | null>(null);
  const overColRef = useRef<number | null>(null);

  const avg = (c: SeededTeam[]) => (c.length ? c.reduce((s, t) => s + t.rating, 0) / c.length : 0);

  const startDrag = (e: React.PointerEvent, ci: number, ti: number, team: SeededTeam) => {
    e.preventDefault();
    dragRef.current = { col: ci, idx: ti };
    overColRef.current = ci;
    setDraggingId(team.id);
    setOverCol(ci);
    setGhost({ x: e.clientX, y: e.clientY, name: team.name });

    const ctrl = new AbortController();
    const { signal } = ctrl;

    const findCol = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)?.closest("[data-pool]") as HTMLElement | null;
      return el ? Number(el.dataset.pool) : null;
    };

    window.addEventListener(
      "pointermove",
      (ev: PointerEvent) => {
        setGhost({ x: ev.clientX, y: ev.clientY, name: team.name });
        const c = findCol(ev.clientX, ev.clientY);
        overColRef.current = c;
        setOverCol(c);
      },
      { signal },
    );

    const finish = () => {
      const from = dragRef.current;
      const to = overColRef.current;
      if (from && to != null && to !== from.col) {
        setCols((prev) => {
          const next = prev.map((c) => [...c]);
          const [moved] = next[from.col]!.splice(from.idx, 1);
          if (moved) next[to]!.push(moved);
          return next;
        });
      }
      dragRef.current = null;
      overColRef.current = null;
      setDraggingId(null);
      setOverCol(null);
      setGhost(null);
      ctrl.abort();
    };
    window.addEventListener("pointerup", finish, { signal });
    window.addEventListener("pointercancel", finish, { signal });
  };

  return (
    <div className="no-print">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Drag teams between pools using the <span className="font-semibold">☰</span> handle (works on
          touch too) — averages update live. Nothing is saved until you click Save.
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
            data-pool={ci}
            className={`card overflow-hidden transition ${overCol === ci && draggingId ? "ring-2 ring-navy-400" : ""}`}
          >
            <div className="flex items-center justify-between bg-navy-900 px-4 py-2.5 text-white">
              <span className="font-bold">{result.pools[ci]?.label ?? `Pool ${ci + 1}`}</span>
              <span className="text-xs text-navy-100">
                Avg <span className="font-semibold tabular-nums">{formatRating(avg(col))}</span> · {col.length} team{col.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="min-h-[64px] divide-y divide-slate-100">
              {col.map((t, ti) => (
                <li
                  key={t.id}
                  className={`flex select-none items-center justify-between gap-2 px-3 py-2 text-sm ${
                    draggingId === t.id ? "opacity-40" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      role="button"
                      aria-label={`Drag ${t.name}`}
                      onPointerDown={(e) => startDrag(e, ci, ti, t)}
                      className="touch-none cursor-grab select-none px-1 text-base leading-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
                    >
                      ☰
                    </span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      {t.seed}
                    </span>
                    <span className="font-medium text-slate-800">{t.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold text-navy-800">{formatRating(t.rating)}</span>
                </li>
              ))}
              {col.length === 0 && (
                <li className="px-3 py-5 text-center text-xs text-slate-400">Drop teams here</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {/* Floating drag preview that follows the pointer/finger. */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-navy-300 bg-white px-3 py-1.5 text-sm font-medium text-navy-800 shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.name}
        </div>
      )}
    </div>
  );
}
