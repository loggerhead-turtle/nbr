"use client";

import { useState } from "react";
import Link from "next/link";
import { TeamMedallion } from "@/components/team-medallion";
import { ProvisionalBadge, GhostBadge } from "@/components/badges";
import { teamMedallion } from "@/lib/medallion";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";
import type { RatingRow } from "@/lib/queries";

type Metric = "rating" | "games" | "record";
const METRIC_LABEL: Record<Metric, string> = { rating: "NBR", games: "GP", record: "Record" };

/** Build a homepage URL with one query param changed, resetting pagination. */
function withParam(sp: Record<string, string | undefined>, key: string, value: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page" && k !== key) params.set(k, v);
  }
  params.set(key, value);
  return `/?${params.toString()}`;
}

const PAD = "px-3 py-3 sm:px-4";

/**
 * Public ratings table. Phones are narrow, so Team stays pinned and a "Show:"
 * toggle swaps which single metric column (Rating / GP / Record) is visible —
 * no rotating or horizontal scrolling. At sm+ every column shows and the toggle
 * hides. Sorting is via the column headers (server navigation).
 */
export function RatingsTable({
  rows,
  sort,
  sp,
}: {
  rows: RatingRow[];
  sort: string;
  sp: Record<string, string | undefined>;
}) {
  const [metric, setMetric] = useState<Metric>("rating");

  // A togglable metric column: visible on mobile only when it's the active one;
  // always visible from sm up.
  const vis = (m: Metric) => (metric === m ? "" : "hidden sm:table-cell");
  const caret = (col: string) =>
    sort === col ? (col === "name" ? "▲" : "▼") : "↕";

  const SortLink = ({ label, col }: { label: string; col: "name" | "games" | "rating" }) => (
    <Link
      href={withParam(sp, "sort", col)}
      className={`inline-flex items-center gap-1 hover:text-white ${sort === col ? "text-white" : ""}`}
    >
      {label}
      <span aria-hidden className={sort === col ? "" : "opacity-30"}>
        {caret(col)}
      </span>
    </Link>
  );

  return (
    <>
      {/* Mobile-only: prominent accent buttons (like the Generate Pools / Find a
          Scrimmage buttons) to swap which metric column is shown. */}
      <div className="mb-3 flex items-center gap-2 sm:hidden">
        <span className="shrink-0 text-xs font-medium text-slate-500">Show:</span>
        {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            aria-pressed={metric === m}
            className={`flex-1 ${metric === m ? "btn-accent" : "btn-ghost"}`}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-navy-100">
            <tr>
              <th className={PAD}>
                <SortLink label="Team" col="name" />
              </th>
              <th className={`hidden md:table-cell ${PAD}`}>Class / Age</th>
              <th className={`text-right ${PAD} ${vis("games")}`}>
                <SortLink label="GP" col="games" />
              </th>
              <th className={`text-right ${PAD} ${vis("record")}`}>Record</th>
              <th className={`text-right ${PAD} ${vis("rating")}`}>
                <SortLink label="NBR" col="rating" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const tier = teamMedallion({ isGhost: r.isGhost, hasApprovedClaim: r.hasApprovedClaim });
              return (
                <tr key={r.teamId} className="hover:bg-slate-50">
                  <td className={PAD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/teams/${r.slug}`}
                        className={`font-semibold hover:underline ${
                          r.isGhost ? "text-slate-400" : "text-navy-800"
                        }`}
                      >
                        {r.name}
                      </Link>
                      <TeamMedallion tier={tier} />
                      {tier === "gray" && (
                        <Link
                          href={`/claim/${r.slug}`}
                          className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          Claim team
                        </Link>
                      )}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {r.city ? <span>{r.city}, {r.state}</span> : <span>{r.state}</span>}
                      {/* Division has no column on mobile — show it inline there. */}
                      <span className="md:hidden">
                        · {r.classification ? `Varsity ${r.classification}` : ageGroupLabel(r.ageGroup)}
                      </span>
                      {r.isProvisional && <ProvisionalBadge />}
                      {r.isGhost && <GhostBadge />}
                    </div>
                  </td>
                  <td className={`hidden text-slate-600 md:table-cell ${PAD}`}>
                    {r.classification ? `Varsity ${r.classification}` : ageGroupLabel(r.ageGroup)}
                  </td>
                  <td className={`text-right tabular-nums text-slate-600 ${PAD} ${vis("games")}`}>
                    {r.gamesPlayed}
                  </td>
                  <td className={`text-right tabular-nums text-slate-600 ${PAD} ${vis("record")}`}>
                    {formatRecord(r.wins, r.losses, r.ties)}
                  </td>
                  <td className={`text-right ${PAD} ${vis("rating")}`}>
                    <span className="text-lg font-bold tabular-nums text-navy-900">
                      {formatRating(r.rating)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
