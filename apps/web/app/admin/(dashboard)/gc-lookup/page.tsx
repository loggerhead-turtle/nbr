import Link from "next/link";
import { getLookupTeams, getUnverifiedOpponents } from "@nbr/db";
import { AGE_GROUPS } from "@nbr/core";
import {
  GcLookupSearch,
  UnverifiedOpponentList,
  StickyAddTeams,
} from "@/components/admin/gc-lookup";
import { ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameChanger lookup", robots: { index: false } };

export default async function GcLookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const age =
    sp.age && (AGE_GROUPS as readonly string[]).includes(sp.age) ? sp.age : undefined;
  const selectedId = sp.team || undefined;

  const [teams, view] = await Promise.all([
    getLookupTeams({ q, ageGroup: age }),
    selectedId ? getUnverifiedOpponents(selectedId) : Promise.resolve(null),
  ]);

  const teamHref = (id: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (age) params.set("age", age);
    params.set("team", id);
    return `/admin/gc-lookup?${params.toString()}`;
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">GameChanger lookup</h1>
      <p className="mb-4 max-w-2xl text-sm text-slate-500">
        Pick a <strong>verified</strong> team to see the opponents on its schedule that are still{" "}
        <strong>unverified</strong> (auto-created ghosts). Hit <strong>Copy name</strong>, paste it
        into GameChanger search to find the real team, then add it by its GameChanger ID. Working
        through your teams this way steadily verifies everyone they&rsquo;ve played. With no search,
        the most recently added teams show first — so a team you add tonight is right here to work
        through.
      </p>

      <div className="mb-5">
        <GcLookupSearch defaultQuery={q} defaultAge={age} />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,20rem)_1fr]">
        {/* Team picker */}
        <div className="card overflow-hidden">
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {q ? `Matches for “${q}”` : "Most unverified opponents"}
            {age ? ` · ${ageGroupLabel(age)}` : ""}
          </p>
          {teams.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400">No verified teams found.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-auto">
              {teams.map((t) => {
                const active = t.id === selectedId;
                return (
                  <li key={t.id}>
                    <Link
                      href={teamHref(t.id)}
                      scroll={false}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                        active ? "bg-sky-50" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-800">{t.name}</span>
                        <span className="block text-xs text-slate-400">
                          {t.city ? `${t.city} · ` : ""}
                          {ageGroupLabel(t.ageGroup)}
                          {t.gcTeamId ? "" : " · no GC id"}
                        </span>
                      </span>
                      {t.unverifiedCount > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                          title={`${t.unverifiedCount} unverified opponent(s)`}
                        >
                          {t.unverifiedCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Selected team's unverified opponents */}
        <div>
          {view ? (
            <UnverifiedOpponentList view={view} />
          ) : (
            <div className="card p-10 text-center text-sm text-slate-500">
              Select a team on the left to see its unverified opponents.
            </div>
          )}
        </div>
      </div>

      {/* Floating add-teams box that follows the screen while you scroll. */}
      <StickyAddTeams />
    </div>
  );
}
