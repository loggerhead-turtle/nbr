import Link from "next/link";
import { getRatings } from "@/lib/queries";
import { ageGroupLabel } from "@/lib/format";
import { ScrimmageFinderCard } from "@/components/scrimmage-finder-card";
import { RatingsFilterBar } from "@/components/ratings-filter-bar";
import { RatingsTable } from "@/components/ratings-table";
import { getLiveSearchEnabled } from "@/lib/site-settings";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";

export const revalidate = 3600; // ISR: static-fast, refreshed hourly

// Must be a valid AGE_GROUPS value ("U12"), not the display label ("12U") —
// otherwise it matches no option (the filter falls back to the first, 8U) and
// the query gets an invalid age group and returns nothing.
const DEFAULT_DIVISION = "U12";

/**
 * Resolve the single division to show. Accepts a `division` token ("U14" for an
 * age group, "v:3A" for a varsity class), falls back to legacy ?age/?class
 * links, and defaults to 12U. The public list is never a mixed cross-age view.
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

const SORT_LABELS: Record<string, string> = {
  games: "games played",
  rating: "rating (high to low)",
  name: "team name (A–Z)",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  // The public ratings always show a single division (one age group or one
  // varsity class) — never a mixed cross-age list. Default to 12U.
  const division = resolveDivision(sp);
  const ageGroup = division.kind === "age" ? division.value : undefined;
  const classification = division.kind === "class" ? division.value : undefined;
  const includeProvisional = sp.prov === "1";
  const sort = (sp.sort as "rating" | "name" | "games") || "games";
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
          {" · "}
          <span className="text-slate-400">Sorted by {SORT_LABELS[sort]}</span>
        </p>

        {rows.length === 0 ? <EmptyState /> : <RatingsTable rows={rows} sort={sort} sp={sp} />}

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
