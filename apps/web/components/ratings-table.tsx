"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TeamMedallion } from "@/components/team-medallion";
import { ProvisionalBadge, GhostBadge } from "@/components/badges";
import { teamMedallion } from "@/lib/medallion";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";
import type { RatingRow } from "@/lib/queries";

type Metric = "rating" | "games" | "record";
const METRIC_LABEL: Record<Metric, string> = { rating: "Rating", games: "GP", record: "Record" };

const PAD = "px-3 py-3 sm:px-4";
const isMetric = (s: string): s is Metric =>
  s === "rating" || s === "games" || s === "record";

/**
 * Public ratings table. Phones are narrow, so Team stays pinned and the mobile
 * "Show:" buttons pick which single metric column (Rating / GP / Record) is
 * visible. Each button also SORTS by that metric; tapping the active one again
 * flips the direction. At sm+ every column shows and the toggle hides. Sorting
 * is server-side (whole list, correct pagination) via URL ?sort=&dir=.
 */
export function RatingsTable({
  rows,
  sort,
  dir,
  sp,
}: {
  rows: RatingRow[];
  sort: string;
  dir: "asc" | "desc";
  sp: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>(() => (isMetric(sort) ? sort : "rating"));
  // Keep the visible mobile column in step with the active sort (e.g. when sorted
  // from a desktop header).
  useEffect(() => {
    if (isMetric(sort)) setMetric(sort);
  }, [sort]);

  // A togglable metric column: visible on mobile only when it's the active one;
  // always visible from sm up.
  const vis = (m: Metric) => (metric === m ? "" : "hidden sm:table-cell");

  const defaultDir = (col: string): "asc" | "desc" => (col === "name" ? "asc" : "desc");
  // URL for sorting by `col`: same column → flip direction; new column → its default.
  const sortHref = (col: string) => {
    const nextDir = sort === col ? (dir === "desc" ? "asc" : "desc") : defaultDir(col);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page" && k !== "sort" && k !== "dir") params.set(k, v);
    }
    params.set("sort", col);
    params.set("dir", nextDir);
    return `/?${params.toString()}`;
  };
  const caret = (col: string) => (sort === col ? (dir === "asc" ? "▲" : "▼") : "↕");

  const SortLink = ({ label, col }: { label: string; col: string }) => (
    <Link
      href={sortHref(col)}
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
          Scrimmage buttons). Each shows that metric's column AND sorts by it;
          tapping the active one again flips the sort direction. */}
      <div className="mb-3 flex items-center gap-2 sm:hidden">
        <span className="shrink-0 text-xs font-medium text-slate-500">Show:</span>
        {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMetric(m);
              router.push(sortHref(m));
            }}
            aria-pressed={metric === m}
            className={`flex-1 ${metric === m ? "btn-accent" : "btn-ghost"}`}
          >
            {METRIC_LABEL[m]}
            {sort === m && (
              <span aria-hidden className="ml-1">
                {dir === "asc" ? "▲" : "▼"}
              </span>
            )}
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
              <th className={`text-right ${PAD} ${vis("record")}`}>
                <SortLink label="Record" col="record" />
              </th>
              <th className={`text-right ${PAD} ${vis("rating")}`}>
                <SortLink label="Rating" col="rating" />
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
