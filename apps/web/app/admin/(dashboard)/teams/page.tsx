import Link from "next/link";
import { prisma, Prisma } from "@nbr/db";
import { formatDate } from "@/lib/format";
import { TeamRow, type TeamRowData } from "@/components/admin/team-row";
import { MergeForm } from "@/components/admin/merge-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage teams", robots: { index: false } };

export default async function ManageTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q, filter } = await searchParams;
  const unclassifiedOnly = filter === "unclassified";

  const where: Prisma.TeamWhereInput = {
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(unclassifiedOnly ? { ageGroup: null } : {}),
  };

  const [teams, unclassifiedCount] = await Promise.all([
    prisma.team.findMany({
      where,
      orderBy: [{ ageGroup: { sort: "asc", nulls: "first" } }, { isGhost: "asc" }, { name: "asc" }],
      include: { _count: { select: { homeGames: true, awayGames: true } } },
      take: 500,
    }),
    prisma.team.count({ where: { ageGroup: null } }),
  ]);

  const rows: TeamRowData[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    gcTeamId: t.gcTeamId,
    ageGroup: t.ageGroup,
    scrapeEnabled: t.scrapeEnabled,
    isGhost: t.isGhost,
    games: t._count.homeGames + t._count.awayGames,
    lastScrapedAt: t.lastScrapedAt ? formatDate(t.lastScrapedAt) : null,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-900">Manage teams</h1>
        <Link href="/admin/teams/new" className="btn-primary">
          + Add team
        </Link>
      </div>

      {unclassifiedCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-900">
            <strong>{unclassifiedCount}</strong> team{unclassifiedCount === 1 ? "" : "s"} need an age
            group assigned before they appear publicly.
          </span>
          {unclassifiedOnly ? (
            <Link href="/admin/teams" className="font-medium text-amber-900 underline">
              Show all
            </Link>
          ) : (
            <Link href="/admin/teams?filter=unclassified" className="font-medium text-amber-900 underline">
              Review unclassified →
            </Link>
          )}
        </div>
      )}

      <form method="get" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search teams…" className="input max-w-xs" />
        {unclassifiedOnly && <input type="hidden" name="filter" value="unclassified" />}
        <button className="btn-ghost">Search</button>
      </form>

      <p className="mb-3 text-sm text-slate-500">
        {rows.length} team{rows.length === 1 ? "" : "s"}. Fix a GameChanger ID and Save to re-queue
        it for scraping. Deleting a team also removes its games.
      </p>

      <div className="mb-6">
        <p className="mb-1 text-sm font-semibold text-navy-900">Merge duplicates</p>
        <p className="mb-2 text-xs text-slate-500">
          Combine an accidental duplicate (e.g. an auto-created “unverified” team and the one you
          added) into a single team. Games move over and duplicate matchups are removed.
        </p>
        <MergeForm teams={rows.map((r) => ({ id: r.id, label: `${r.name}${r.isGhost ? " (unverified)" : ""} · ${r.games}g` }))} />
      </div>

      <div className="space-y-3">
        {rows.map((t) => (
          <TeamRow key={t.id} team={t} />
        ))}
      </div>
    </div>
  );
}
