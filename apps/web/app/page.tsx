import Link from "next/link";
import { getRatings } from "@/lib/queries";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";
import { ProvisionalBadge, GhostBadge } from "@/components/badges";
import { TeamMedallion } from "@/components/team-medallion";
import { ScrimmageFinderCard } from "@/components/scrimmage-finder-card";
import { RatingsFilterBar } from "@/components/ratings-filter-bar";
import { teamMedallion } from "@/lib/medallion";
import { getLiveSearchEnabled } from "@/lib/site-settings";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";

export const revalidate = 3600; // ISR: static-fast, refreshed hourly

const DEFAULT_DIVISION = "12U";

/**
 * Resolve the single division to show. Accepts a `division` token ("14U" for an
 * age group, "v:3A" for a varsity class), falls back to legacy ?age/?class
 * links, and defaults to 14U. The public list is never a mixed cross-age view.
 */
function resolveDivision(sp: Record<string, string | undefined>): {
  kind: "age" | "class";
  value: string;
  token: string;
} {
  const raw = sp.division || (sp.class ? `v:${sp.class}` : sp.age) || DEFAULT_DIVISION;
  if (raw.startsWith("v:")) {
    const cls = raw.slice(2);
    if ((CLASSIFICATIONS as readonly string[]).includes(cls)) {
      return { kind: "class", value: cls, token: `v:${cls}` };
    }
  } else if ((AGE_GROUPS as readonly string[]).includes(raw)) {
    return { kind: "age", value: raw, token: raw };
  }
  return { kind: "age", value: DEFAULT_DIVISION, token: DEFAULT_DIVISION };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  // The public ratings always show a single division (one age group or one
  // varsity class) — never a mixed cross-age list. Default to 14U.
  const division = resolveDivision(sp);
  const ageGroup = division.kind === "age" ? division.value : undefined;
  const classification = division.kind === "class" ? division.value : undefined;
  const includeProvisional = sp.prov === "1";
  const sort = (sp.sort as "rating" | "name" | "games") || "name";
  const page = Number(sp.page) || 1;
  const liveSearch = await getLiveSearchEnabled();

  const { rows, total } = await getRatings({
    search,
    ageGroup,
    classification,
    includeProvisional,
    sort,
    page,
    pageSize: 50,
  });

  return (
    <div>
      <Hero />

      <section className="mx-auto max-w-6xl px-4 pt-8">
        <ScrimmageFinderCard />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <RatingsFilterBar
          search={search}
          division={division.token}
          includeProvisional={includeProvisional}
          sort={sort}
          liveSearch={liveSearch}
        />

        <p className="mb-3 mt-6 text-sm text-slate-500">
          {total.toLocaleString()} ranked team{total === 1 ? "" : "s"}
          {" · "}
          {classification ? `Varsity ${classification}` : ageGroupLabel(ageGroup)}
          {search ? ` · matching “${search}”` : ""}
        </p>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-900 text-xs uppercase tracking-wide text-navy-100">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Class / Age</th>
                  <th className="px-4 py-3 text-right">Record</th>
                  <th className="px-4 py-3 text-right">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const rank = !includeProvisional ? (page - 1) * 50 + i + 1 : null;
                  const tier = teamMedallion({
                    isGhost: r.isGhost,
                    hasApprovedClaim: r.hasApprovedClaim,
                  });
                  return (
                    <tr key={r.teamId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-400">
                        {rank ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
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
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          {r.city ? <span>{r.city}, {r.state}</span> : <span>{r.state}</span>}
                          {r.isProvisional && <ProvisionalBadge />}
                          {r.isGhost && <GhostBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.classification ? `Varsity ${r.classification}` : ageGroupLabel(r.ageGroup)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatRecord(r.wins, r.losses, r.ties)}
                      </td>
                      <td className="px-4 py-3 text-right">
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
        )}

        <Pagination page={page} total={total} pageSize={50} sp={sp} />
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
          The National Baseball Ratings
        </h1>
        <p className="mt-3 max-w-2xl text-navy-100">
          Independent, data-driven ratings for amateur baseball teams. Search any team’s
          rating, build perfectly balanced tournament pools, or find an evenly matched
          scrimmage nearby — free, no login required.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pools" className="btn-accent">
            Generate Tournament Pools
          </Link>
          <Link href="/scrimmages" className="btn-accent">
            Find a Scrimmage
          </Link>
          <Link href="/submit-team" className="btn-ghost bg-white text-navy-900 hover:bg-navy-50">
            + Add your team
          </Link>
          <Link href="/about" className="btn-ghost bg-white/10 text-white hover:bg-white/20">
            How ratings work
          </Link>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <p className="text-lg font-semibold text-navy-900">No ranked teams yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Ratings appear once teams have played enough games. Know a team that should be
        here?{" "}
        <Link href="/submit-team" className="font-medium text-navy-700 underline">
          Add their GameChanger team ID
        </Link>
        .
      </p>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  sp,
}: {
  page: number;
  total: number;
  pageSize: number;
  sp: Record<string, string | undefined>;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(sp).forEach(([k, v]) => v && k !== "page" && params.set(k, v));
    params.set("page", String(p));
    return `/?${params.toString()}`;
  };
  return (
    <div className="mt-6 flex items-center justify-between text-sm">
      <span className="text-slate-500">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={makeHref(page - 1)} className="btn-ghost">
            ← Previous
          </Link>
        )}
        {page < pages && (
          <Link href={makeHref(page + 1)} className="btn-ghost">
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
