"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Quick confidence bands matching the merge-confidence model's natural levels. */
const PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "All" },
  { label: "100%", min: 100, max: 100 },
  { label: "95–99%", min: 95, max: 99 },
  { label: "90–94%", min: 90, max: 94 },
  { label: "70–89%", min: 70, max: 89 },
  { label: "50–69%", min: 50, max: 69 },
  { label: "< 50%", min: 1, max: 49 },
];

function toQuery(min?: number, max?: number): string {
  const q = new URLSearchParams();
  if (min != null) q.set("min", String(min));
  if (max != null) q.set("max", String(max));
  const s = q.toString();
  return s ? `/admin/duplicates?${s}` : "/admin/duplicates";
}

/**
 * Filter the duplicate list by merge-confidence level. Navigates with ?min=&max=
 * query params so the server re-queries and scores deeper to surface the chosen
 * band (lower levels sort below the top of the list).
 */
export function DuplicateFilter({ min, max }: { min: number | null; max: number | null }) {
  const router = useRouter();
  const [minVal, setMinVal] = useState(min != null ? String(min) : "");
  const [maxVal, setMaxVal] = useState(max != null ? String(max) : "");

  const go = (lo?: number, hi?: number) => router.push(toQuery(lo, hi));

  const applyCustom = () => {
    const lo = minVal.trim() === "" ? undefined : Math.max(1, Math.min(100, Number(minVal) || 0));
    const hi = maxVal.trim() === "" ? undefined : Math.max(1, Math.min(100, Number(maxVal) || 0));
    go(lo, hi);
  };

  const activePreset = (p: (typeof PRESETS)[number]) =>
    (p.min ?? null) === min && (p.max ?? null) === max;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Confidence:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => go(p.min, p.max)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              activePreset(p)
                ? "bg-navy-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <label className="flex items-center gap-1 text-xs text-slate-500">
          min
          <input
            type="number"
            min={1}
            max={100}
            value={minVal}
            onChange={(e) => setMinVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="—"
            className="input h-8 w-16 text-right text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          max
          <input
            type="number"
            min={1}
            max={100}
            value={maxVal}
            onChange={(e) => setMaxVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="—"
            className="input h-8 w-16 text-right text-xs"
          />
        </label>
        <button onClick={applyCustom} className="btn-ghost text-navy-800">
          Apply
        </button>
      </div>
    </div>
  );
}
