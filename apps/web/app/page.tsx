import Link from "next/link";
import { getRatings } from "@/lib/queries";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";
import { ProvisionalBadge, GhostBadge } from "@/components/badges";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";

export const revalidate = 3600; // ISR: static-fast, refreshed hourly

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  const ageGroup = sp.age || undefined;
  const classification = sp.class || undefined;
  const includeProvisional = sp.prov === "1";
  const sort = (sp.sort as "rating" | "name" | "games") || "rating";
  const page = Number(sp.page) || 1;

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

      <section className="mx-auto max-w-6xl px-4 py-8">
        <FilterBar
          search={search}
          ageGroup={ageGroup}
          classification={classification}
          includeProvisional={includeProvisional}
          sort={sort}
        />

        <p className="mb-3 mt-6 text-sm text-slate-500">
          {total.toLocaleString()} ranked team{total === 1 ? "" : "s"}
          {ageGroup ? ` · ${ageGroupLabel(ageGroup)}` : ""}
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
                  return (
                    <tr key={r.teamId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-400">
                        {rank ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/teams/${r.slug}`}
                          className="font-semibold text-navy-800 hover:underline"
                        >
                          {r.name}
                        </Link>
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
          rating, or build perfectly balanced tournament pools in seconds — free, no login
          required.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pools" className="btn-accent">
            Generate Tournament Pools
          </Link>
          <Link href="/about" className="btn-ghost bg-white/10 text-white hover:bg-white/20">
            How ratings work
          </Link>
        </div>
      </div>
    </section>
  );
}

function FilterBar({
  search,
  ageGroup,
  classification,
  includeProvisional,
  sort,
}: {
  search?: string;
  ageGroup?: string;
  classification?: string;
  includeProvisional: boolean;
  sort: string;
}) {
  return (
    <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor="q">
          Search teams
        </label>
        <input
          id="q"
          name="q"
          defaultValue={search}
          placeholder="Team name…"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="class">
          Classification <span className="font-normal text-slate-400">(varsity)</span>
        </label>
        <select id="class" name="class" defaultValue={classification ?? ""} className="input">
          <option value="">All</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="age">
          Age group <span className="font-normal text-slate-400">(youth)</span>
        </label>
        <select id="age" name="age" defaultValue={ageGroup ?? ""} className="input">
          <option value="">All</option>
          {AGE_GROUPS.map((a) => (
            <option key={a} value={a}>
              {ageGroupLabel(a)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sort">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={sort} className="input">
          <option value="rating">Rating</option>
          <option value="name">Name</option>
          <option value="games">Games played</option>
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
        <input type="checkbox" name="prov" value="1" defaultChecked={includeProvisional} />
        Include provisional
      </label>
      <button type="submit" className="btn-primary">
        Apply
      </button>
    </form>
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
