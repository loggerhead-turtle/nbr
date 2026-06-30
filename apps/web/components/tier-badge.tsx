import { NBR_TIERS, type NbrTier } from "@nbr/core";

/** Compact colored chips for the NBR competitive tiers (A / AA / AAA / Majors). */
const TIER_STYLE = {
  Majors: { label: "M", full: "Majors", cls: "bg-amber-400 text-amber-950" },
  AAA: { label: "AAA", full: "AAA", cls: "bg-emerald-600 text-white" },
  AA: { label: "AA", full: "AA", cls: "bg-sky-600 text-white" },
  A: { label: "A", full: "A", cls: "bg-slate-400 text-white" },
} as const;

function styleFor(tier: NbrTier) {
  return TIER_STYLE[tier as keyof typeof TIER_STYLE] ?? TIER_STYLE.A;
}

export function TierBadge({ tier, className = "" }: { tier: NbrTier; className?: string }) {
  const s = styleFor(tier);
  return (
    <span
      title={`${s.full} (competitive tier within age group)`}
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none ${s.cls} ${className}`}
    >
      {s.label}
    </span>
  );
}

/** Legend mapping each tier chip to its meaning — shown once above a table. */
export function TierLegend({ className = "" }: { className?: string }) {
  const tiers = [...NBR_TIERS].reverse() as NbrTier[];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 ${className}`}>
      <span className="font-medium text-slate-600">Tiers (within age group):</span>
      {tiers.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <TierBadge tier={t} />
          <span>{styleFor(t).full}</span>
        </span>
      ))}
    </div>
  );
}
