import type { Metadata } from "next";
import { getTeamMapData } from "@/lib/queries";
import { TeamsMap } from "@/components/teams-map";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team Map",
  description: "Map of rated baseball teams and where they're located.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  const { points, counts } = await getTeamMapData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-black text-navy-900">Team map</h1>
      <p className="mt-1 text-sm text-slate-500">
        Where rated teams are located. Tap a dot for the team.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Verified teams mapped" value={counts.verified} tone="navy" />
        <Stat label="With a coach" value={counts.coached} tone="emerald" />
        <Stat label="Unverified (scraped)" value={counts.ghost} tone="slate" />
        <Stat label="Verified, no location yet" value={counts.unlocatedVerified} tone="slate" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <Legend color="#10b981" label="Verified + coach" />
        <Legend color="#94a3b8" label="Verified, claimable" />
        <Legend color="#e2e8f0" label="Unverified" />
      </div>

      <div className="mt-3">
        {points.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            No teams have map coordinates yet. Run the geocode backfill (worker `geocode`) to place
            teams on the map.
          </div>
        ) : (
          <TeamsMap points={points} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "navy" | "emerald" | "slate" }) {
  const valueCls =
    tone === "emerald" ? "text-emerald-600" : tone === "navy" ? "text-navy-900" : "text-slate-700";
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-black tabular-nums ${valueCls}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full border border-navy-900/40"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
