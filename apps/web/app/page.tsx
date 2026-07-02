import Link from "next/link";
import { getRatings } from "@/lib/queries";
import { ageGroupLabel } from "@/lib/format";
import { ScrimmageFinderCard } from "@/components/scrimmage-finder-card";
import { RatingsFilterBar } from "@/components/ratings-filter-bar";
import { RatingsTable } from "@/components/ratings-table";
import { TierLegend } from "@/components/tier-badge";
import { getLiveSearchEnabled } from "@/lib/site-settings";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";

// Rendered per request so sort/division/page query params always take effect
// (ISR was serving a cached order regardless of ?sort).
export const dynamic = "force-dynamic";

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
  rating: "NBR",
  name: "team name",
};
const DIR_LABEL: Record<string, string> = { asc: "low to high", desc: "high to low" };

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
  // Default: rank by NBR, high to low.
  const sort = (sp.sort as "rating" | "name" | "games") || "rating";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "name" ? "asc" : "desc";
  const page = Number(sp.page) || 1;
  const liveSearch = await getLiveSearchEnabled();

  const { rows, total } = await getRatings({
    search,
    ageGroup,
    classification,
    includeProvisional,
    sort,
    dir,
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
          {total.toLocaleString()} team{total === 1 ? "" : "s"} in the NBR
          {" · "}
          {classification ? `Varsity ${classification}` : ageGroupLabel(ageGroup)}
          {search ? ` · matching “${search}”` : ""}
          {" · "}
          <span className="text-slate-400">Sorted by {SORT_LABELS[sort]} ({DIR_LABEL[dir]})</span>
        </p>

        {rows.some((r) => r.tier) && <TierLegend className="mb-3" />}

        {rows.length === 0 ? <EmptyState /> : <RatingsTable rows={rows} sort={sort} dir={dir} sp={sp} />}

        <Pagination page={page} total={total} pageSize={50} sp={sp} />
      </section>

      <HowNbrWorks />
      <WhyNotInNbr />
    </div>
  );
}

function HowNbrWorks() {
  return (
    <section id="how-nbr-works" className="mx-auto max-w-6xl px-4 pb-8">
      <div className="card p-6">
        <h2 className="text-lg font-bold text-navy-900">How the NBR works</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          The NBR is a single number for every team, earned entirely from who they play and how
          the games go — no polls and no opinions.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Who you play is everything.</span>{" "}
            Beating a strong team raises your NBR more than beating a weak one — strength of
            schedule is built in.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Margin of victory is capped at 7 runs.</span>{" "}
            Winning by 7 moves your NBR the same as winning by 15, so running up the score never
            helps.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Recent games weigh more.</span> Older
            results fade, so your NBR reflects how you’re playing now.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">One scale across ages.</span> Every age
            group sits on one developmental curve, so an average 16U sits above an average 8U.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">New teams are provisional.</span> An NBR
            firms up after about 5 games; until then the team is marked provisional.
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          <Link href="/about" className="font-medium text-navy-700 underline">
            Read the full method →
          </Link>
        </p>
      </div>
    </section>
  );
}

function WhyNotInNbr() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12">
      <div className="card p-6">
        <h2 className="text-lg font-bold text-navy-900">Why isn’t my team in the NBR?</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          If you don’t see your team, it’s almost always one of these:
        </p>
        <ul className="mt-4 space-y-3">
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">It’s brand new.</span> A team is
            provisional until it has at least 5 games, and provisional teams are hidden by default.
            Tick <span className="font-medium">“Include provisional”</span> above to see them.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">It has no division set.</span> A team
            needs a division — an age group (like 16U) or a varsity class — before it appears. Once
            it’s assigned, it shows up in that division.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Its games are against teams not yet in
            the NBR.</span> Only games between teams that are both in the NBR count toward your
            number, so an NBR fills in as more of your opponents join.
          </li>
          <li className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">You’re viewing a different division.</span>{" "}
            This page shows one division at a time — switch the division filter above to your team’s
            age or class.
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Think your team belongs here?{" "}
          <Link href="/submit-team" className="font-medium text-navy-700 underline">
            Add your team →
          </Link>
        </p>
      </div>
    </section>
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
          An independent, data-driven NBR for every amateur baseball team. Look up any team’s
          NBR, build perfectly balanced tournament pools, or find an evenly matched
          scrimmage nearby — free, no login required.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pools" className="btn-accent">
            Generate Tournament Pools
          </Link>
          <Link href="/demo/td" className="btn-accent">
            Tournament Director Demo
          </Link>
          <Link href="/scrimmages" className="btn-accent">
            Find a Scrimmage
          </Link>
          <Link href="/submit-team" className="btn-ghost bg-white text-navy-900 hover:bg-navy-50">
            + Add your team
          </Link>
          <Link href="/about" className="btn-ghost bg-white/10 text-white hover:bg-white/20">
            How the NBR works
          </Link>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <p className="text-lg font-semibold text-navy-900">No teams in the NBR yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        An NBR appears once teams have played enough games. Know a team that should be
        here?{" "}
        <Link href="/submit-team" className="font-medium text-navy-700 underline">
          Add your team
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
