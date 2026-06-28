import type { MedallionTier } from "@/lib/medallion";

/**
 * Small circular trust emblem. Green = verified team with an active coach;
 * gray = verified team (no coach yet); nothing for unverified scraped teams.
 */
export function TeamMedallion({ tier, className = "" }: { tier: MedallionTier; className?: string }) {
  if (!tier) return null;
  const green = tier === "green";
  return (
    <span
      title={
        green
          ? "Verified team with an active coach"
          : "Verified team (no coach claimed yet)"
      }
      aria-label={green ? "Verified, coached" : "Verified"}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ${
        green ? "bg-emerald-500" : "bg-slate-400"
      } ${className}`}
    >
      ✓
    </span>
  );
}
